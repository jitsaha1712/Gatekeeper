
#include <boost/asio.hpp>
#include <boost/beast.hpp>
#include <boost/beast/http.hpp>

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <deque>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <utility>

namespace net = boost::asio;
namespace beast = boost::beast;
namespace http = boost::beast::http;

using tcp = net::ip::tcp;

// Track request times for each client IP.
std::map<
    std::string,
    std::deque<std::chrono::steady_clock::time_point>
> request_times;

// Write timestamped events to the terminal and a log file.
// Never log passwords, JWTs, internal keys, or post contents.
void log_event(const std::string& event) {
    const std::time_t now =
        std::chrono::system_clock::to_time_t(
            std::chrono::system_clock::now()
        );

    std::ostringstream timestamp;
    const std::tm* local_time = std::localtime(&now);

    if (local_time != nullptr) {
        timestamp << std::put_time(
            local_time,
            "%Y-%m-%d %H:%M:%S"
        );
    } else {
        timestamp << "unknown-time";
    }

    const std::string line =
        "[" + timestamp.str() + "] " + event;

    std::cout << line << '\n';

    // Append to the file instead of overwriting earlier events.
    std::ofstream logfile("gatekeeper.log", std::ios::app);

    if (logfile.is_open()) {
        logfile << line << '\n';
    }
}

// Allow up to 30 requests per minute per IP address.
bool rate_limit_exceeded(const std::string& ip) {
    using clock = std::chrono::steady_clock;

    const auto now = clock::now();
    auto& times = request_times[ip];

    while (!times.empty() &&
           now - times.front() >= std::chrono::seconds(60)) {
        times.pop_front();
    }

    if (times.size() >= 30) {
        return true;
    }

    times.push_back(now);
    return false;
}

// Send an error response to the client.
void send_error(
    tcp::socket& client,
    http::status status,
    unsigned version,
    const std::string& message
) {
    http::response<http::string_body> response{status, version};

    response.set(http::field::content_type, "text/plain");
    response.body() = message;
    response.prepare_payload();
    response.keep_alive(false);

    beast::error_code ec;
    http::write(client, response, ec);
}

// Handle one incoming request.
void handle_client(tcp::socket client) {
    beast::flat_buffer client_buffer;
    http::request<http::string_body> request;

    beast::error_code ec;
    http::read(client, client_buffer, request, ec);

    if (ec) {
        return;
    }

    // Identify the client IP.
    beast::error_code endpoint_ec;
    const auto endpoint = client.remote_endpoint(endpoint_ec);

    const std::string client_ip = endpoint_ec
        ? "unknown"
        : endpoint.address().to_string();

    // Apply rate limiting before forwarding.
    if (rate_limit_exceeded(client_ip)) {
        send_error(
            client,
            http::status::too_many_requests,
            request.version(),
            "Rate limit exceeded. Try again later.\n"
        );

        std::ostringstream event;
        event << "RATE LIMITED"
              << " client_ip=" << client_ip
              << " method=" << http::to_string(request.method());

        log_event(event.str());
        return;
    }

    // Accept only the methods currently needed by the blog.
    const auto method = request.method();

    if (method != http::verb::get &&
        method != http::verb::post &&
        method != http::verb::delete_ &&
        method != http::verb::options) {
        send_error(
            client,
            http::status::method_not_allowed,
            request.version(),
            "HTTP method is not supported by Gatekeeper.\n"
        );

        std::ostringstream event;
        event << "METHOD BLOCKED"
              << " client_ip=" << client_ip
              << " method=" << http::to_string(method);

        log_event(event.str());
        return;
    }

    // Remove the query string when checking and logging the route.
    std::string path(request.target());
    const auto query_pos = path.find('?');

    if (query_pos != std::string::npos) {
        path.resize(query_pos);
    }

    // Forward only the blog API routes.
    if (path != "/api" && path.rfind("/api/", 0) != 0) {
        send_error(
            client,
            http::status::not_found,
            request.version(),
            "Route not available through Gatekeeper.\n"
        );

        std::ostringstream event;
        event << "ROUTE BLOCKED"
              << " client_ip=" << client_ip
              << " method=" << http::to_string(method)
              << " path=" << path;

        log_event(event.str());
        return;
    }

    // Read the private key used for communication with Django.
    const char* internal_key =
        std::getenv("GATEKEEPER_INTERNAL_KEY");

    if (internal_key == nullptr || *internal_key == '\0') {
        send_error(
            client,
            http::status::internal_server_error,
            request.version(),
            "Gatekeeper internal key is not configured.\n"
        );

        log_event("CONFIGURATION ERROR: internal key is missing.");
        return;
    }

    try {
        // Connect to the Django backend.
        net::io_context backend_ioc;
        tcp::resolver resolver(backend_ioc);
        beast::tcp_stream backend(backend_ioc);

        auto endpoints =
            resolver.resolve("127.0.0.1", "8000");

        backend.connect(endpoints);

        // Preserve the original HTTP method, path, and version.
        http::request<http::string_body> backend_request{
            request.method(),
            request.target(),
            request.version()
        };

        // Forward ordinary headers, including the user's JWT.
        // Ignore client-supplied internal keys and rebuild hop-by-hop headers.
        for (const auto& field : request.base()) {
            std::string name(field.name_string());

            std::transform(
                name.begin(),
                name.end(),
                name.begin(),
                [](unsigned char ch) {
                    return static_cast<char>(std::tolower(ch));
                }
            );

            if (name == "host" ||
                name == "connection" ||
                name == "content-length" ||
                name == "transfer-encoding" ||
                name == "keep-alive" ||
                name == "proxy-connection" ||
                name == "proxy-authorization" ||
                name == "proxy-authenticate" ||
                name == "upgrade" ||
                name == "expect" ||
                name == "x-gatekeeper-internal-key") {
                continue;
            }

            backend_request.set(
                field.name_string(),
                field.value()
            );
        }

        backend_request.set(
            http::field::host,
            "127.0.0.1:8000"
        );

        backend_request.set(
            http::field::user_agent,
            "Gatekeeper-Proxy/1.2"
        );

        // Attach the trusted internal key for Django.
        backend_request.set(
            "X-Gatekeeper-Internal-Key",
            internal_key
        );

        // Forward the request body, including JSON content.
        backend_request.body() = request.body();
        backend_request.keep_alive(false);
        backend_request.prepare_payload();

        // Send the request to Django.
        http::write(backend, backend_request);

        // Read Django's response.
        beast::flat_buffer backend_buffer;
        http::response<http::string_body> backend_response;

        http::read(
            backend,
            backend_buffer,
            backend_response
        );

        // Return Django's response to the original client.
        backend_response.keep_alive(false);
        http::write(client, backend_response);

        // Record method, route, client IP, and response status.
        // Do not record request bodies or authentication headers.
        std::ostringstream event;
        event << "REQUEST"
              << " client_ip=" << client_ip
              << " method=" << http::to_string(method)
              << " path=" << path
              << " backend_status=" << backend_response.result_int();

        log_event(event.str());

    } catch (const std::exception& error) {
        log_event(
            std::string("BACKEND ERROR: ") + error.what()
        );

        send_error(
            client,
            http::status::bad_gateway,
            request.version(),
            "Gatekeeper could not reach Django.\n"
        );
    }
}

int main() {
    try {
        net::io_context ioc;

        const auto address =
            net::ip::make_address("127.0.0.1");

        tcp::acceptor acceptor{
            ioc,
            tcp::endpoint{address, 8080}
        };

        log_event(
            "Gatekeeper started on http://127.0.0.1:8080"
        );

        while (true) {
            tcp::socket client{ioc};
            acceptor.accept(client);
            handle_client(std::move(client));
        }

    } catch (const std::exception& error) {
        log_event(
            std::string("PROXY ERROR: ") + error.what()
        );

        return 1;
    }
}
