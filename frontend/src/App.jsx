import { useEffect, useState } from "react";
import "./App.css";

const API_BASE = "/gatekeeper/api";

const REACTIONS = [
  { id: "like", emoji: "👍", label: "Like" },
  { id: "love", emoji: "❤️", label: "Love" },
  { id: "care", emoji: "🥰", label: "Care" },
  { id: "haha", emoji: "😂", label: "Haha" },
  { id: "wow", emoji: "😮", label: "Wow" },
  { id: "sad", emoji: "😢", label: "Sad" },
  { id: "angry", emoji: "😡", label: "Angry" },
];

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers || {}),
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    let message = `Request failed (${response.status}).`;

    if (typeof data === "string") {
      message = data;
    } else if (data?.detail) {
      message = data.detail;
    } else if (data && typeof data === "object") {
      message = Object.entries(data)
        .map(([field, value]) => {
          const readableValue = Array.isArray(value)
            ? value.join(" ")
            : value;

          return `${field}: ${readableValue}`;
        })
        .join(" · ");
    }

    throw new Error(message);
  }

  return data;
}

function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getInitial(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}

/* Reaction picker */
function ReactionPicker({ post, busy, onReact }) {
  const [hovered, setHovered] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);

  const isOpen = hovered || pinnedOpen;

  const selectedReaction = REACTIONS.find(
    (reaction) => reaction.id === post.my_reaction
  );

  const counts = post.reaction_counts || {};

  function closePicker() {
    setHovered(false);
    setPinnedOpen(false);
  }

  function chooseReaction(reactionId) {
    closePicker();
    onReact(post, reactionId);
  }

  return (
    <div
      className={`reaction-picker${isOpen ? " is-open" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closePicker();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          closePicker();
        }
      }}
    >
      <button
        type="button"
        className={`reaction-trigger reaction-trigger-icon${
          selectedReaction ? " has-reaction" : ""
        }`}
        onClick={() => setPinnedOpen((previous) => !previous)}
        disabled={busy}
        aria-label={
          selectedReaction
            ? `Your reaction is ${selectedReaction.label}. Change reaction.`
            : "Choose a reaction"
        }
        aria-expanded={isOpen}
        title={selectedReaction ? selectedReaction.label : "Add reaction"}
      >
        <span className="trigger-emoji" aria-hidden="true">
          {selectedReaction ? selectedReaction.emoji : "＋"}
        </span>

        <span className="reaction-caret" aria-hidden="true">
          ⌄
        </span>
      </button>

      <div
        className="reaction-menu"
        role="group"
        aria-label="Choose your reaction"
      >
        {REACTIONS.map((reaction) => {
          const selected = post.my_reaction === reaction.id;
          const count = Number(counts[reaction.id] || 0);

          return (
            <button
              key={reaction.id}
              type="button"
              className={`reaction-option${selected ? " selected" : ""}`}
              onClick={() => chooseReaction(reaction.id)}
              disabled={busy}
              title={reaction.label}
              aria-label={`${reaction.label}: ${count} reactions`}
              aria-pressed={selected}
            >
              <span className="reaction-option-emoji">
                {reaction.emoji}
              </span>

              <span className="reaction-option-label">
                {reaction.label}
              </span>

              {count > 0 && (
                <span className="reaction-option-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* Instagram-style three-dot post menu */
function PostMenu({ post, busy, onDelete }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="post-menu"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="post-menu-trigger"
        onClick={() => setOpen((previous) => !previous)}
        disabled={busy}
        aria-label="Post options"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More options"
      >
        <span aria-hidden="true">⋯</span>
      </button>

      {open && (
        <div className="post-menu-dropdown" role="menu">
          <button
            type="button"
            className="post-menu-delete"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onDelete(post);
            }}
          >
            <span aria-hidden="true">⌫</span>
            Delete post
          </button>
        </div>
      )}
    </div>
  );
}

function App() {
  const [posts, setPosts] = useState([]);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const [postText, setPostText] = useState("");
  const [commentDrafts, setCommentDrafts] = useState({});
  const [openComments, setOpenComments] = useState({});
  const [busy, setBusy] = useState(false);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialFeed() {
      try {
        const data = await apiRequest("/posts/");

        if (!cancelled) {
          setPosts(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            type: "error",
            text: `Could not load posts: ${error.message}`,
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingPosts(false);
        }
      }
    }

    loadInitialFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshFeed(authToken = token) {
    setRefreshing(true);

    try {
      const data = await apiRequest("/posts/", {
        headers: authToken
          ? { Authorization: `Bearer ${authToken}` }
          : {},
      });

      setPosts(Array.isArray(data) ? data : []);
      return true;
    } catch (error) {
      setNotice({
        type: "error",
        text: `Could not refresh the feed: ${error.message}`,
      });

      return false;
    } finally {
      setRefreshing(false);
    }
  }

  function handleAuthChange(event) {
    const { name, value } = event.target;

    setAuthForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);

    try {
      if (authMode === "register") {
        await apiRequest("/register/", {
          method: "POST",
          body: JSON.stringify({
            username: authForm.username.trim(),
            email: authForm.email.trim(),
            password: authForm.password,
          }),
        });

        setAuthMode("login");

        setAuthForm((previous) => ({
          ...previous,
          password: "",
        }));

        setNotice({
          type: "success",
          text: "Account created. Welcome to the community!",
        });

        return;
      }

      const data = await apiRequest("/token/", {
        method: "POST",
        body: JSON.stringify({
          username: authForm.username.trim(),
          password: authForm.password,
        }),
      });

      const profile = await apiRequest("/me/", {
        headers: {
          Authorization: `Bearer ${data.access}`,
        },
      });

      setToken(data.access);
      setUsername(profile.username);
      setCurrentUser(profile);

      setAuthForm((previous) => ({
        ...previous,
        password: "",
      }));

      await refreshFeed(data.access);

      setNotice({
        type: "success",
        text: `Welcome back, ${profile.username}.`,
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handlePublish(event) {
    event.preventDefault();

    if (!token) {
      setNotice({
        type: "error",
        text: "Please log in to share a post.",
      });
      return;
    }

    const content = postText.trim();
    if (!content || busy) return;

    setBusy(true);
    setNotice(null);

    try {
      await apiRequest("/posts/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      setPostText("");
      await refreshFeed(token);

      setNotice({
        type: "success",
        text: "Your post is live.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleReaction(post, reactionId) {
    if (!token) {
      setAuthMode("login");

      setNotice({
        type: "error",
        text: "Log in to leave a reaction.",
      });

      document
        .getElementById("account")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });

      return;
    }

    if (busy) return;

    setBusy(true);
    setNotice(null);

    try {
      const path = `/posts/${post.id}/reaction/`;

      if (post.my_reaction === reactionId) {
        await apiRequest(path, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        await apiRequest(path, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ reaction: reactionId }),
        });
      }

      await refreshFeed(token);
    } catch (error) {
      setNotice({
        type: "error",
        text: `Could not update reaction: ${error.message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCommentSubmit(event, post) {
    event.preventDefault();

    if (!token) {
      setAuthMode("login");

      setNotice({
        type: "error",
        text: "Log in to join the conversation.",
      });

      return;
    }

    const content = (commentDrafts[post.id] || "").trim();
    if (!content || busy) return;

    setBusy(true);
    setNotice(null);

    try {
      await apiRequest(`/posts/${post.id}/comments/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content }),
      });

      setCommentDrafts((previous) => ({
        ...previous,
        [post.id]: "",
      }));

      setOpenComments((previous) => ({
        ...previous,
        [post.id]: true,
      }));

      await refreshFeed(token);

      setNotice({
        type: "success",
        text: "Comment added.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: `Could not add comment: ${error.message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(post) {
    if (!token || !currentUser) {
      setNotice({
        type: "error",
        text: "Please log in first.",
      });
      return;
    }

    const canDelete =
      post.author === currentUser.username ||
      currentUser.is_staff ||
      currentUser.is_superuser;

    if (!canDelete) {
      setNotice({
        type: "error",
        text: "You can delete only your own posts.",
      });
      return;
    }

    if (!window.confirm("Delete this post? This cannot be undone.")) {
      return;
    }

    setBusy(true);
    setNotice(null);

    try {
      await apiRequest(`/posts/${post.id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setPosts((previous) =>
        previous.filter((item) => item.id !== post.id)
      );

      setNotice({
        type: "success",
        text: "Post deleted.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: `Could not delete post: ${error.message}`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setToken("");
    setUsername("");
    setCurrentUser(null);
    setCommentDrafts({});

    setNotice({
      type: "success",
      text: "You've logged out.",
    });

    await refreshFeed("");
  }

  function toggleComments(postId) {
    setOpenComments((previous) => ({
      ...previous,
      [postId]: !previous[postId],
    }));
  }

  function requestLoginForComment() {
    setAuthMode("login");

    setNotice({
      type: "error",
      text: "Log in to leave a comment.",
    });

    document
      .getElementById("account")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#home" aria-label="Gatekeeper home">
          <span className="brand-mark">g.</span>

          <span className="brand-name">
            gatekeeper
            <small>THE COMMUNITY BOARD</small>
          </span>
        </a>

        <nav className="top-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#feed">
            The feed
          </a>

          <a className="nav-link" href="#write">
            Write something
          </a>
        </nav>

        <div className="topbar-right">
          <span className="proxy-status">
            <span className="status-dot" />
            <span>Protected by Gatekeeper</span>
          </span>

          {token ? (
            <button className="logout-button" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <a className="login-link" href="#account">
              Log in <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      </header>

      <section className="hero" id="home">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-rule" />
            A LITTLE CORNER OF THE INTERNET
          </p>

          <h1>
            Good things happen
            <br />
            when we <em>talk.</em>
          </h1>

          <p className="hero-description">
            Thoughts, small wins, big questions, half-formed ideas.
            Pull up a chair and join in.
          </p>

          <a className="hero-link" href={token ? "#write" : "#account"}>
            {token ? "Write your first thought" : "Join the conversation"}
            <span aria-hidden="true">↗</span>
          </a>
        </div>

        <aside className="hero-note" aria-label="Community note">
          <span className="note-label">A NOTE FROM THE ROOM</span>
          <span className="note-quote">“</span>

          <p>
            Be curious.
            <br />
            Be kind.
            <br />
            <em>Stay a while.</em>
          </p>

          <div className="note-footer">
            <span className="note-line" />
            <span>EST. 2026</span>
          </div>
        </aside>
      </section>

      {notice && (
        <div
          className={`notice ${notice.type}`}
          role="status"
          aria-live="polite"
        >
          <span className="notice-mark">
            {notice.type === "error" ? "!" : "✓"}
          </span>

          <p>{notice.text}</p>

          <button
            className="notice-close"
            onClick={() => setNotice(null)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      )}

      <main className="content-grid">
        <section className="feed-section" id="feed">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FRESH FROM THE COMMUNITY</p>
              <h2>
                The feed<span className="heading-period">.</span>
              </h2>
            </div>

            <button
              className="refresh-button"
              onClick={() => refreshFeed()}
              disabled={refreshing}
            >
              <span
                className={
                  refreshing
                    ? "refresh-symbol spinning"
                    : "refresh-symbol"
                }
              >
                ↻
              </span>
              {refreshing ? "Updating" : "Refresh"}
            </button>
          </div>

          {loadingPosts ? (
            <div className="feed-state">
              <span className="loading-spinner" />
              <p>Getting the room ready…</p>
            </div>
          ) : posts.length === 0 ? (
            <div className="feed-state empty-feed">
              <span className="empty-pencil">✳</span>
              <h3>It's quiet in here.</h3>
              <p>Be the first to leave a thought on the board.</p>

              <a href={token ? "#write" : "#account"}>
                {token ? "Write a post" : "Create an account"} ↗
              </a>
            </div>
          ) : (
            <div className="post-list">
              {posts.map((post) => {
                const reactionCounts = post.reaction_counts || {};

                const comments = Array.isArray(post.comments)
                  ? post.comments
                  : [];

                const totalReactions = Object.values(reactionCounts).reduce(
                  (sum, count) => sum + Number(count || 0),
                  0
                );

                const activeReactions = REACTIONS.filter(
                  (reaction) =>
                    Number(reactionCounts[reaction.id] || 0) > 0
                )
                  .sort(
                    (a, b) =>
                      Number(reactionCounts[b.id] || 0) -
                      Number(reactionCounts[a.id] || 0)
                  )
                  .slice(0, 3);

                const canDelete = Boolean(
                  currentUser &&
                    (post.author === currentUser.username ||
                      currentUser.is_staff ||
                      currentUser.is_superuser)
                );

                return (
                  <article className="post-card" key={post.id}>
                    <div className="post-accent" />

                    <div className="post-card-inner">
                      <div className="post-header">
                        {canDelete ? (
                          <PostMenu
                            post={post}
                            busy={busy}
                            onDelete={handleDelete}
                          />
                        ) : (
                          <span
                            className="post-header-spacer"
                            aria-hidden="true"
                          />
                        )}

                        <div className="post-byline">
                          <div className="author-line">
                            <strong>{post.author}</strong>

                            {currentUser?.username === post.author && (
                              <span className="you-label">YOU</span>
                            )}

                            {(currentUser?.is_staff ||
                              currentUser?.is_superuser) &&
                              post.author === currentUser?.username && (
                                <span className="admin-label">ADMIN</span>
                              )}
                          </div>

                          <time dateTime={post.created_at}>
                            {formatDate(post.created_at)}
                          </time>
                        </div>

                        <div className="post-avatar" aria-hidden="true">
                          {getInitial(post.author)}
                        </div>
                      </div>

                      <div className="post-content-wrap">
                        <p className="post-content">{post.content}</p>
                      </div>

                      <div
                        className={`engagement-summary${
                          totalReactions === 0 ? " no-reactions" : ""
                        }`}
                      >
                        <div
                          className="engagement-reactions"
                          aria-label={`${totalReactions} reactions`}
                          title={`${totalReactions} ${
                            totalReactions === 1 ? "reaction" : "reactions"
                          }`}
                        >
                          {totalReactions > 0 ? (
                            <>
                              <div
                                className="reaction-summary-icons"
                                aria-hidden="true"
                              >
                                {activeReactions.map((reaction) => (
                                  <span
                                    key={reaction.id}
                                    className="summary-emoji"
                                    title={reaction.label}
                                  >
                                    {reaction.emoji}
                                  </span>
                                ))}
                              </div>

                              <span className="engagement-total">
                                {totalReactions}
                              </span>
                            </>
                          ) : (
                            <span className="empty-reaction-hint">
                              <span aria-hidden="true">＋</span>
                              Be the first
                            </span>
                          )}
                        </div>

                        <button
                          className={`comment-count-link${
                            openComments[post.id] ? " active" : ""
                          }`}
                          onClick={() => toggleComments(post.id)}
                          aria-label={`${comments.length} ${
                            comments.length === 1 ? "comment" : "comments"
                          }; ${
                            openComments[post.id] ? "hide" : "show"
                          } conversation`}
                          aria-expanded={Boolean(openComments[post.id])}
                          title={`${comments.length} ${
                            comments.length === 1 ? "comment" : "comments"
                          }`}
                        >
                          <span
                            className="comment-count-icon"
                            aria-hidden="true"
                          >
                            ▤
                          </span>

                          <span className="comment-count-number">
                            {comments.length}
                          </span>
                        </button>
                      </div>

                      <div className="post-actions">
                        <ReactionPicker
                          post={post}
                          busy={busy}
                          onReact={handleReaction}
                        />

                        <button
                          className={`text-action${
                            openComments[post.id] ? " action-active" : ""
                          }`}
                          onClick={() => toggleComments(post.id)}
                          aria-expanded={Boolean(openComments[post.id])}
                        >
                          <span aria-hidden="true">↳</span>
                          {openComments[post.id]
                            ? "Hide conversation"
                            : "Join conversation"}
                        </button>
                      </div>

                      {openComments[post.id] && (
                        <section className="comments-section">
                          <div className="comments-heading">
                            <span>THE CONVERSATION</span>
                            <span>{comments.length}</span>
                          </div>

                          {comments.length > 0 ? (
                            <div className="comment-list">
                              {comments.map((comment) => (
                                <div
                                  className="comment-item"
                                  key={comment.id}
                                >
                                  <div className="comment-avatar">
                                    {getInitial(comment.author)}
                                  </div>

                                  <div className="comment-body">
                                    <div className="comment-meta">
                                      <strong>{comment.author}</strong>
                                      <time dateTime={comment.created_at}>
                                        {formatDate(comment.created_at)}
                                      </time>
                                    </div>

                                    <p>{comment.content}</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="no-comments">
                              No comments yet. There's room for your voice.
                            </p>
                          )}

                          {token ? (
                            <form
                              className="comment-form"
                              onSubmit={(event) =>
                                handleCommentSubmit(event, post)
                              }
                            >
                              <div className="comment-avatar current-avatar">
                                {getInitial(username)}
                              </div>

                              <div className="comment-input-wrap">
                                <textarea
                                  rows={2}
                                  maxLength={1000}
                                  value={commentDrafts[post.id] || ""}
                                  onChange={(event) =>
                                    setCommentDrafts((previous) => ({
                                      ...previous,
                                      [post.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Add something thoughtful…"
                                  aria-label={`Comment on post ${post.id}`}
                                  required
                                />

                                <div className="comment-submit-row">
                                  <span>
                                    {(commentDrafts[post.id] || "").length}/1000
                                  </span>

                                  <button
                                    type="submit"
                                    className="comment-submit"
                                    disabled={
                                      busy ||
                                      !(commentDrafts[post.id] || "").trim()
                                    }
                                  >
                                    {busy ? "Sending…" : "Send comment ↗"}
                                  </button>
                                </div>
                              </div>
                            </form>
                          ) : (
                            <div className="comment-login-prompt">
                              <span>Have something to add?</span>

                              <button
                                type="button"
                                onClick={requestLoginForComment}
                              >
                                Log in to comment ↗
                              </button>
                            </div>
                          )}
                        </section>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className="sidebar">
          {token ? (
            <>
              <section className="sidebar-card account-card" id="account">
                <p className="eyebrow">YOUR CORNER</p>

                <div className="account-identity">
                  <div className="account-avatar">
                    {getInitial(username)}
                  </div>

                  <div className="account-details">
                    <strong>{username}</strong>
                    <span>
                      {currentUser?.is_staff || currentUser?.is_superuser
                        ? "Community administrator"
                        : "Member of the community"}
                    </span>
                  </div>

                  <span className="account-check" title="Signed in">
                    ✓
                  </span>
                </div>

                <p className="account-note">
                  You're part of the conversation. Be generous with your
                  reactions and thoughtful with your words.
                </p>
              </section>

              <section className="sidebar-card composer-card" id="write">
                <div className="composer-heading">
                  <p className="eyebrow">LEAVE A LITTLE SOMETHING</p>
                  <span className="composer-pencil">✳</span>
                </div>

                <h3>What's on your mind?</h3>

                <p className="composer-description">
                  No grand speech needed. Just be yourself.
                </p>

                <form onSubmit={handlePublish}>
                  <textarea
                    value={postText}
                    onChange={(event) => setPostText(event.target.value)}
                    placeholder="I've been thinking about…"
                    maxLength={280}
                    rows={5}
                    required
                    aria-label="Write your post"
                  />

                  <div className="composer-footer">
                    <span
                      className={postText.length > 250 ? "near-limit" : ""}
                    >
                      {postText.length}/280
                    </span>

                    <button
                      className="primary-button"
                      type="submit"
                      disabled={busy || !postText.trim()}
                    >
                      {busy ? "Publishing…" : "Put it out there ↗"}
                    </button>
                  </div>
                </form>
              </section>
            </>
          ) : (
            <section className="sidebar-card auth-card" id="account">
              <p className="eyebrow">PULL UP A CHAIR</p>

              <div className="auth-tabs">
                <button
                  className={authMode === "login" ? "active" : ""}
                  onClick={() => setAuthMode("login")}
                  type="button"
                >
                  Log in
                </button>

                <button
                  className={authMode === "register" ? "active" : ""}
                  onClick={() => setAuthMode("register")}
                  type="button"
                >
                  Sign up
                </button>
              </div>

              <h3>
                {authMode === "login"
                  ? "Good to see you again."
                  : "Come on in."}
              </h3>

              <p className="auth-description">
                {authMode === "login"
                  ? "Pick up where you left off."
                  : "Make an account and add your voice to the room."}
              </p>

              <form onSubmit={handleAuthSubmit} className="auth-form">
                <label htmlFor="username">Username</label>

                <input
                  id="username"
                  name="username"
                  value={authForm.username}
                  onChange={handleAuthChange}
                  placeholder="Your username"
                  autoComplete="username"
                  required
                />

                {authMode === "register" && (
                  <>
                    <label htmlFor="email">Email address</label>

                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={authForm.email}
                      onChange={handleAuthChange}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </>
                )}

                <label htmlFor="password">Password</label>

                <input
                  id="password"
                  name="password"
                  type="password"
                  value={authForm.password}
                  onChange={handleAuthChange}
                  placeholder="Your password"
                  autoComplete={
                    authMode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                  minLength={authMode === "register" ? 8 : undefined}
                  required
                />

                <button
                  className="primary-button auth-submit"
                  type="submit"
                  disabled={busy}
                >
                  {busy
                    ? "One moment…"
                    : authMode === "login"
                      ? "Come on in ↗"
                      : "Create my account ↗"}
                </button>
              </form>

              <p className="privacy-note">
                <span aria-hidden="true">♢</span>
                A password is yours alone. Keep it that way.
              </p>
            </section>
          )}

          <section className="sidebar-card community-card">
            <div className="community-mark">g.</div>
            <p className="eyebrow">A FRIENDLY REMINDER</p>
            <h3>Good conversations leave room for everyone.</h3>
            <div className="community-divider" />
            <p>
              React honestly. Disagree kindly. Remember there's a person
              on the other side of the screen.
            </p>
          </section>

          <div className="sidebar-footnote">
            <span className="status-dot" />
            <span>Requests pass through Gatekeeper.</span>
          </div>
        </aside>
      </main>

      <footer className="site-footer">
        <a className="footer-brand" href="#home">
          gatekeeper<span>.</span>
        </a>

        <span>A small corner of the internet · 2026</span>

        <a href="#home" className="back-to-top">
          Back to top ↑
        </a>
      </footer>
    </div>
  );
}

export default App;