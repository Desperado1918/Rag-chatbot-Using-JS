// ============================================================================
// auth-config.js — Global Frontend Authentication Helper
// ============================================================================

(function () {
    // Keep track of the original fetch function
    const originalFetch = window.fetch;

    // Helper to parse cookies
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    // Intercept native fetch calls to inject CSRF headers & handle 401s
    window.fetch = async function (url, options = {}) {
        options.headers = options.headers || {};
        
        // Add CSRF token for state-changing requests
        const stateChangingMethods = ["POST", "PUT", "DELETE", "PATCH"];
        const method = (options.method || "GET").toUpperCase();
        
        if (stateChangingMethods.includes(method)) {
            const csrfToken = getCookie("csrf_token");
            if (csrfToken) {
                options.headers["X-CSRF-Token"] = csrfToken;
            }
        }
        
        let response = await originalFetch(url, options);
        
        // Try silent refresh on 401s (excluding auth routes themselves)
        const isAuthRoute = url.includes("/api/auth/refresh") || url.includes("/api/auth/login") || url.includes("/api/auth/signup") || url.includes("/api/auth/me");
        if (response.status === 401 && !isAuthRoute) {
            try {
                const refreshRes = await originalFetch("/api/auth/refresh", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": getCookie("csrf_token") || ""
                    }
                });
                
                if (refreshRes.ok) {
                    // Retry the request with the new tokens
                    if (stateChangingMethods.includes(method)) {
                        options.headers["X-CSRF-Token"] = getCookie("csrf_token") || "";
                    }
                    return await originalFetch(url, options);
                }
            } catch (e) {
                console.error("Token refresh failed:", e);
            }
            
            // Redirect to login disabled for testing convenience
            console.warn("Authentication failed, but redirect to login is disabled.");
        }
        
        return response;
    };

    // Inject User Styles
    const style = document.createElement("style");
    style.textContent = `
        .user-profile-widget {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            padding: 6px 12px;
            border-radius: 9999px;
            font-size: 13px;
            font-weight: 500;
            color: #f3f4f6;
            position: relative;
            cursor: pointer;
            user-select: none;
            transition: all 0.2s ease;
        }
        .user-profile-widget:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .user-avatar-circle {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: #4f46e5;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
        }
        .user-name-text {
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .user-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 8px;
            background: #161c2d;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
            z-index: 9999;
            min-width: 120px;
            overflow: hidden;
        }
        .user-dropdown.show {
            display: block;
        }
        .dropdown-item {
            padding: 10px 16px;
            font-size: 13px;
            color: #ef4444;
            background: none;
            border: none;
            width: 100%;
            text-align: left;
            cursor: pointer;
            transition: background 0.2s;
        }
        .dropdown-item:hover {
            background: rgba(239, 68, 68, 0.1);
        }
        .header-right {
            display: flex;
            align-items: center;
            gap: 12px;
        }
    `;
    document.head.appendChild(style);

    // Render Top Right Username and Dropdown
    function renderUserBadge(user) {
        document.addEventListener("DOMContentLoaded", () => {
            const username = user.username || user.email.split("@")[0];
            const initial = username.charAt(0);
            
            const widget = document.createElement("div");
            widget.className = "user-profile-widget";
            widget.innerHTML = `
                <div class="user-avatar-circle">${initial}</div>
                <span class="user-name-text">${username}</span>
                <div class="user-dropdown" id="userProfileDropdown">
                    <button class="dropdown-item" id="btnUserLogout">Sign Out</button>
                </div>
            `;
            
            let injected = false;
            
            if (window.location.pathname.endsWith("/inspector.html")) {
                const headerNav = document.querySelector(".header-nav");
                if (headerNav) {
                    headerNav.insertBefore(widget, headerNav.firstChild);
                    injected = true;
                }
            } else if (window.location.pathname.endsWith("/analytics.html")) {
                const headerRight = document.querySelector(".header-right");
                if (headerRight) {
                    headerRight.appendChild(widget);
                    injected = true;
                }
            } else if (window.location.pathname.endsWith("/debug.html")) {
                const chatHeader = document.querySelector(".chat-header");
                if (chatHeader) {
                    let headerRight = chatHeader.querySelector(".header-right");
                    if (!headerRight) {
                        headerRight = document.createElement("div");
                        headerRight.className = "header-right";
                        chatHeader.appendChild(headerRight);
                    }
                    headerRight.appendChild(widget);
                    injected = true;
                }
            } else {
                // default dashboard (index.html)
                const chatHeader = document.querySelector(".chat-header");
                if (chatHeader) {
                    // Try to find the child div containing buttons and badges
                    const flexRight = chatHeader.querySelector("div[style*='display: flex; align-items: center']");
                    if (flexRight) {
                        flexRight.insertBefore(widget, flexRight.firstChild);
                        injected = true;
                    }
                }
            }
            
            if (!injected) {
                // Fallback fixed position
                widget.style.position = "fixed";
                widget.style.top = "16px";
                widget.style.right = "16px";
                widget.style.zIndex = "9999";
                document.body.appendChild(widget);
            }
            
            // Dropdown Toggle
            widget.addEventListener("click", (e) => {
                e.stopPropagation();
                const dropdown = document.getElementById("userProfileDropdown");
                dropdown.classList.toggle("show");
            });
            
            document.addEventListener("click", () => {
                const dropdown = document.getElementById("userProfileDropdown");
                if (dropdown) dropdown.classList.remove("show");
            });
            
            document.getElementById("btnUserLogout")?.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    await originalFetch("/api/auth/logout", {
                        method: "POST",
                        headers: {
                            "X-CSRF-Token": getCookie("csrf_token") || ""
                        }
                    });
                } catch (err) {
                    console.error("Logout failed:", err);
                }
                window.location.href = "/auth.html";
            });
        });
    }

    // Authenticate Session Check on Page Load (Bypassed)
    async function checkAuthSession() {
        const isAuthPage = window.location.pathname.endsWith("/auth.html");
        
        if (isAuthPage) {
            window.location.href = "/";
            return;
        }
        
        // Render dummy user badge immediately without requiring server verification
        renderUserBadge({
            username: "poonish",
            email: "poonishmukherjee18@gmail.com",
        });
    }

    // Run auth check immediately
    checkAuthSession();
})();
