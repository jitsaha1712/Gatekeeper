# Gatekeeper 🔐

**A full-stack community platform with a C++ security proxy, Django REST API, and React frontend.**

Gatekeeper is a community posting application where users can publish thoughts, react to posts with emojis, and participate in conversations through comments. It combines a modern React interface with a Django backend and a custom C++ proxy that controls how API requests reach the backend.

The project explores full-stack development, API protection, authentication, request filtering, and rate limiting.

## ✨ Features

### Community Features
- **User registration and login:** Create an account and authenticate using JSON Web Tokens (JWT).
- **Community feed:** Publish and browse posts.
- **Emoji reactions:** React using Like, Love, Care, Haha, Wow, Sad, and Angry.
- **Comments:** Add comments and view conversations beneath posts.
- **Post management:** Authors can delete their own posts, and administrators can have additional permissions.
- **Responsive interface:** A custom-designed community experience for desktop and mobile screens.

### Security Features
- **C++ API proxy:** Routes API traffic through a dedicated gateway.
- **Internal-key validation:** Django validates a private key supplied by the proxy for API and authentication endpoints.
- **Request filtering:** The proxy permits configured HTTP methods and restricts forwarding to API routes.
- **Rate limiting:** The proxy limits requests per client IP address.
- **JWT authentication:** Django REST Framework and Simple JWT handle application authentication.
- **Permission checks:** Backend permissions control who can create posts, react, comment, and delete content.
- **Security tests:** A PowerShell script checks proxy routing, internal-key protection, unsupported methods, unknown endpoints, and rate limiting.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, JavaScript, Vite, CSS |
| Security proxy | C++, Boost.Asio, Boost.Beast |
| Backend | Python, Django, Django REST Framework |
| Authentication | JSON Web Tokens, Simple JWT |
| Database | SQLite |
| Testing | Django tests, PowerShell, curl |
| Development environment | Windows, PowerShell, MSYS2 UCRT64 |

## 🏗️ Architecture

Gatekeeper uses three main application layers:

```text
                  User / Browser
                        |
                        v
               React + Vite Frontend
                  Port 5173
                        |
                        v
                C++ Gatekeeper Proxy
                  Port 8080
                        |
                Private internal key
                        |
                        v
                 Django REST API
                  Port 8000
                        |
                        v
                  SQLite Database
```

### How requests work

1. The user interacts with the React frontend.
2. The frontend sends API requests through the Vite development proxy using the `/gatekeeper/api` prefix.
3. Vite forwards these requests to the C++ proxy on port `8080`.
4. The C++ proxy checks the request method and route, applies rate limiting, and forwards supported API requests to Django.
5. The C++ proxy attaches the private `X-Gatekeeper-Internal-Key` header.
6. Django middleware validates the internal key before allowing requests to reach the API views.
7. Django handles authentication, permissions, application logic, and database operations.

**Important:** The C++ proxy provides request filtering and rate limiting. Django remains responsible for validating user authentication and application permissions.

## 📁 Project Structure

```text
Gatekeeper/
├── django_backend/
│   ├── accounts/
│   │   ├── migrations/
│   │   ├── serializers.py
│   │   ├── tests.py
│   │   ├── urls.py
│   │   └── views.py
│   ├── posts/
│   │   ├── migrations/
│   │   ├── models.py
│   │   ├── serializers.py
│   │   ├── tests.py
│   │   ├── urls.py
│   │   └── views.py
│   ├── config/
│   │   ├── middleware.py
│   │   ├── settings.py
│   │   └── urls.py
│   └── manage.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── proxy.cpp
├── security_test.ps1
├── requirements.txt
├── README.md
└── .gitignore
```

Private secret files, the local SQLite database, virtual environments, compiled programs, and logs are kept outside version control through Git ignore rules.

## ⚙️ Prerequisites

Install the following tools before setting up the project:

- Python and pip
- Node.js and npm
- MSYS2 UCRT64 with GCC
- Boost C++ headers compatible with your compiler
- Git

The example commands below assume that Gatekeeper is located at:

```text
C:\Users\user\Gatekeeper
```

If you use a different location, update the commands accordingly.

## 🚀 Getting Started

### 1. Install Python dependencies

Open PowerShell in your project root:

```powershell
cd C:\Users\user\Gatekeeper

python -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install -r requirements.txt
```

If your existing `.venv` is already configured, activate it instead of creating a new environment.

### 2. Create private secrets

Gatekeeper uses a Django secret key and an internal key shared between the C++ proxy and Django.

Run these commands from the project root. They create the files only when they do not already exist.

```powershell
cd C:\Users\user\Gatekeeper

if (-not (Test-Path ".django-secret-key")) {
    python -c "import secrets; from pathlib import Path; Path('.django-secret-key').write_text(secrets.token_urlsafe(50), encoding='utf-8')"
}

if (-not (Test-Path ".gatekeeper-key")) {
    python -c "import secrets; from pathlib import Path; Path('.gatekeeper-key').write_text(secrets.token_urlsafe(32), encoding='utf-8')"
}
```

Keep these files private. Do not share their contents or commit them to GitHub.

### 3. Run the Django backend

Open a new PowerShell terminal:

```powershell
cd C:\Users\user\Gatekeeper

.\.venv\Scripts\Activate.ps1

$env:GATEKEEPER_INTERNAL_KEY = (
    Get-Content ".\.gatekeeper-key" -Raw
).Trim()

cd .\django_backend

python manage.py migrate
python manage.py test
python manage.py runserver 127.0.0.1:8000
```

Keep this terminal open.

Django listens locally at:

`http://127.0.0.1:8000`

The internal key must remain configured in this terminal while Django is running.

### 4. Build and run the C++ proxy

Open a second PowerShell terminal:

```powershell
cd C:\Users\user\Gatekeeper

$env:PATH = "C:\msys64\ucrt64\bin;$env:PATH"

$env:GATEKEEPER_INTERNAL_KEY = (
    Get-Content ".\.gatekeeper-key" -Raw
).Trim()

& "C:\msys64\ucrt64\bin\g++.exe" `
    -std=c++17 `
    .\proxy.cpp `
    -o .\proxy.exe `
    -lws2_32 `
    -lmswsock

if ($LASTEXITCODE -ne 0) {
    throw "Proxy compilation failed."
}

.\proxy.exe
```

The command assumes GCC and the necessary Boost headers are available under your MSYS2 installation.

Keep this terminal open while using the application.

The proxy listens at:

`http://127.0.0.1:8080`

### 5. Run the React frontend

Open a third PowerShell terminal:

```powershell
cd C:\Users\user\Gatekeeper\frontend

npm install
npm run dev
```

Open the URL printed by Vite, normally:

`http://localhost:5173`

The Vite development configuration forwards `/gatekeeper` requests to the C++ proxy.

## 🔌 Main API Endpoints

The following application endpoints are routed through Django. The C++ proxy receives requests under `/api` and forwards supported requests to the backend.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/register/` | Register a user |
| POST | `/api/token/` | Obtain JWT tokens |
| GET | `/api/me/` | Get the current user profile |
| GET | `/api/posts/` | List community posts |
| POST | `/api/posts/` | Create a post |
| GET | `/api/posts/<id>/` | Retrieve a post |
| DELETE | `/api/posts/<id>/` | Delete a post where permitted |
| GET | `/api/posts/<id>/comments/` | List comments |
| POST | `/api/posts/<id>/comments/` | Add a comment |
| POST | `/api/posts/<id>/reaction/` | Add or change a reaction |
| DELETE | `/api/posts/<id>/reaction/` | Remove your reaction |

Protected actions require valid authentication and appropriate permissions. The backend, not the frontend alone, must enforce those permissions.

## 🧪 Testing

### Run Django tests

With your Python environment activated:

```powershell
cd C:\Users\user\Gatekeeper\django_backend

python manage.py test
```

The project has previously passed 10 Django automated tests, including checks involving post permissions, reactions, comments, and internal-key protection.

### Build the frontend

```powershell
cd C:\Users\user\Gatekeeper\frontend

npm run build
```

A successful build confirms that Vite can compile the frontend for production.

### Run proxy security tests

Start Django and the C++ proxy first. Then open another PowerShell terminal:

```powershell
cd C:\Users\user\Gatekeeper

.\security_test.ps1
```

The current security test script checks:

1. Access to the posts API through the proxy.
2. Direct Django API access without an internal key.
3. Rejection of an incorrect internal key.
4. Rejection of an unsupported HTTP method.
5. Rejection of a non-API proxy route.
6. A `404` response for an unknown API endpoint.
7. Rate limiting under repeated requests.

The script has previously passed all seven checks in the local development environment. Test outcomes can vary if the services are stopped, secrets are misconfigured, or the rate-limit window has not reset.

These checks provide useful coverage, but they do not constitute a complete security audit.

## 🔒 Security and Configuration Notes

Gatekeeper includes several security controls:

- Private Django and proxy keys are loaded from local secret files.
- Django middleware rejects API requests when the internal key is missing or invalid.
- The proxy restricts forwarded routes and supported methods.
- The proxy uses an in-memory, per-IP rate limiter configured for 30 requests per minute.
- Django and the REST framework manage application authentication and permissions.
- Git ignore rules exclude private secrets, local databases, virtual environments, logs, and compiled files.

### Current limitations

The existing setup is designed for local development, not direct production deployment.

Before deploying publicly:

- Disable Django debug mode and configure appropriate allowed hosts.
- Use HTTPS and secure deployment settings.
- Manage secrets through deployment environment variables or a secure secret manager.
- Review frontend origins, CORS and CSRF requirements where applicable.
- Review proxy header handling, IP identification, rate limiting, and logging.
- Add production deployment tests and monitoring.

The current rate limiter stores state in memory. Its counters reset when the proxy restarts and are not shared between multiple proxy processes.

## 🧹 Git Hygiene

Before committing code, verify that sensitive and generated files remain ignored:

```powershell
cd C:\Users\user\Gatekeeper

git status --short --untracked-files=all
```

Check critical exclusions:

```powershell
git check-ignore -v `
    .gatekeeper-key `
    .django-secret-key `
    db.sqlite3 `
    proxy.exe `
    gatekeeper.log `
    .venv `
    frontend/node_modules `
    frontend/dist
```

Do not commit secret keys, authentication tokens, local databases, or compiled executables.

## 🎯 Project Goal

Gatekeeper is a learning project exploring how a modern full-stack application can combine:

- React for an interactive user experience.
- Django REST Framework for API and application logic.
- JWT authentication and permission controls.
- A custom C++ proxy for request filtering and rate limiting.
- Automated tests to verify important application and security behavior.

**Built as a full-stack development and application-security learning project.**
