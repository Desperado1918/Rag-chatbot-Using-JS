// ============================================================================
// inspector.js — Frontend Controller for RAG Pipeline Inspector
// ============================================================================

document.addEventListener("DOMContentLoaded", () => {
    // State management
    let files = [];
    let activeFileId = null;

    // Elements
    const logoText = document.getElementById("logoText");
    const fileInput = document.getElementById("fileInput");
    const uploadZone = document.getElementById("uploadZone");
    const filesList = document.getElementById("filesList");
    const fileCountBadge = document.getElementById("fileCountBadge");
    const chunkingMethodSelect = document.getElementById("chunkingMethodSelect");
    const activeDocLabel = document.getElementById("activeDocLabel");
    
    // Debug panels elements
    const parseCharCount = document.getElementById("parseCharCount");
    const parsePageCount = document.getElementById("parsePageCount");
    const pageBreakdownList = document.getElementById("pageBreakdownList");
    const parsedTextPreview = document.getElementById("parsedTextPreview");
    
    const embedChunkCount = document.getElementById("embedChunkCount");
    const embedVectorDim = document.getElementById("embedVectorDim");
    const embedLogsConsole = document.getElementById("embedLogsConsole");
    
    const retrievalLogs = document.getElementById("retrievalLogs");
    
    // Sandbox chat elements
    const sandboxChatArea = document.getElementById("sandboxChatArea");
    const sandboxInput = document.getElementById("sandboxInput");
    const sandboxSendBtn = document.getElementById("sandboxSendBtn");
    
    // Toast UI
    const toast = document.getElementById("toast");

    // Initialize UI
    refreshFilesList();

    // Reload page when clicking logo
    logoText.style.cursor = "pointer";
    logoText.addEventListener("click", () => {
        window.location.reload();
    });

    // Toast notification helper
    function showToast(message, type = "success") {
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove("hidden");
        setTimeout(() => {
            toast.classList.add("hidden");
        }, 4000);
    }

    // Toggle Tabs
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");
    tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabBtns.forEach((b) => b.classList.remove("active"));
            tabPanels.forEach((p) => p.classList.remove("active"));
            
            btn.classList.add("active");
            const target = btn.dataset.tab;
            document.getElementById(target).classList.add("active");
        });
    });

    // ------------------------------------------------------------------------
    // Stage 1: File Managers & Uploads
    // ------------------------------------------------------------------------

    // Click upload zone to browse
    uploadZone.addEventListener("click", () => fileInput.click());

    // File selected handler
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
        // Reset so re-selecting the same file triggers change
        fileInput.value = "";
    });

    // Drag & drop handlers
    uploadZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", () => {
        uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // API: Refresh files list
    async function refreshFilesList() {
        try {
            const response = await fetch("/api/inspector/files");
            const data = await response.json();
            files = data.files || [];
            
            // Check if active file still exists, otherwise reset
            if (activeFileId && !files.find((f) => f._id === activeFileId)) {
                activeFileId = null;
            }

            renderFilesList();
        } catch (err) {
            console.error("Failed to load files:", err);
            showToast("Failed to connect to the backend.", "error");
        }
    }

    // API: Upload file
    async function handleFileUpload(file) {
        if (files.length >= 5) {
            showToast("Limit reached. You can upload up to 5 PDFs.", "error");
            return;
        }

        if (file.type !== "application/pdf") {
            showToast("Only PDF files are allowed.", "error");
            return;
        }

        const formData = new FormData();
        formData.append("pdf", file);

        showToast("Uploading PDF...", "info");

        try {
            const response = await fetch("/api/inspector/upload", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (response.ok) {
                showToast("File uploaded successfully.");
                refreshFilesList();
            } else {
                showToast(result.error || "Upload failed.", "error");
            }
        } catch (err) {
            console.error("Upload error:", err);
            showToast("Failed to upload file.", "error");
        }
    }

    // API: Delete file
    async function deleteFile(id) {
        if (!confirm("Are you sure you want to delete this document? All vector embeddings associated with it will be purged.")) {
            return;
        }

        try {
            const response = await fetch(`/api/inspector/files/${id}`, {
                method: "DELETE",
            });

            if (response.ok) {
                showToast("Document deleted successfully.");
                if (activeFileId === id) {
                    activeFileId = null;
                    updateActiveDocumentUI();
                }
                refreshFilesList();
            } else {
                showToast("Failed to delete document.", "error");
            }
        } catch (err) {
            console.error("Delete error:", err);
            showToast("Error deleting document.", "error");
        }
    }

    // Render files list DOM
    function renderFilesList() {
        fileCountBadge.textContent = `${files.length} / 5 Files`;
        filesList.innerHTML = "";

        if (files.length === 0) {
            filesList.innerHTML = `<li class="empty-list-placeholder">No documents uploaded yet. Upload up to 5 PDFs to begin.</li>`;
            updateActiveDocumentUI();
            return;
        }

        files.forEach((file) => {
            const li = document.createElement("li");
            li.className = `file-item ${file._id === activeFileId ? "active" : ""}`;
            
            const sizeKB = (file.fileSize / 1024).toFixed(1);
            const isIngested = file.status === "completed";

            li.innerHTML = `
                <div class="file-info-row">
                    <div class="file-meta">
                        <span class="file-name" title="${file.originalName}">${file.originalName}</span>
                        <span class="file-size">${sizeKB} KB</span>
                    </div>
                    <span class="file-status-badge status-${file.status}">${file.status}</span>
                </div>
                <div class="file-actions-row">
                    <label class="active-selector-label">
                        <input type="radio" name="activeContext" value="${file._id}" ${file._id === activeFileId ? "checked" : ""} ${!isIngested ? "disabled" : ""}>
                        <span>Active</span>
                    </label>
                    <div class="file-buttons">
                        <button class="btn btn-secondary btn-ghost ingest-btn" data-id="${file._id}" ${file.status === "processing" ? "disabled" : ""}>
                            ${isIngested ? "Re-Ingest" : "Ingest"}
                        </button>
                        <button class="btn btn-danger btn-ghost delete-btn" data-id="${file._id}">🗑️</button>
                    </div>
                </div>
            `;

            // Radio button click (Select active file)
            const radio = li.querySelector('input[type="radio"]');
            radio.addEventListener("change", () => {
                if (radio.checked) {
                    activeFileId = file._id;
                    document.querySelectorAll(".file-item").forEach((item) => item.classList.remove("active"));
                    li.classList.add("active");
                    updateActiveDocumentUI();
                }
            });

            // Ingest button handler
            li.querySelector(".ingest-btn").addEventListener("click", () => {
                triggerIngestion(file._id);
            });

            // Delete button handler
            li.querySelector(".delete-btn").addEventListener("click", () => {
                deleteFile(file._id);
            });

            filesList.appendChild(li);
        });

        updateActiveDocumentUI();
    }

    // ------------------------------------------------------------------------
    // Stage 2: SSE Ingestion Logs & Observability
    // ------------------------------------------------------------------------

    function triggerIngestion(id) {
        const chunkingMethod = chunkingMethodSelect.value;
        showToast("Starting pipeline ingestion...", "info");

        // Clear console logs
        embedLogsConsole.innerHTML = '<span class="console-line">Connecting to ingestion stream...</span>';
        
        // Select embedding tab to show output logs
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabPanels.forEach((p) => p.classList.remove("active"));
        document.querySelector('[data-tab="embeddingTab"]').classList.add("active");
        document.getElementById("embeddingTab").classList.add("active");

        // Open Server-Sent Events stream
        const eventSource = new EventSource(`/api/inspector/ingest?id=${id}&chunkingMethod=${chunkingMethod}`);

        eventSource.addEventListener("log", (e) => {
            const data = JSON.parse(e.data);
            appendConsoleLog(data.message);
        });

        eventSource.addEventListener("parsing_start", () => {
            appendConsoleLog("STAGE 1: Parsing PDF...", "info");
        });

        eventSource.addEventListener("parsing_done", (e) => {
            const data = JSON.parse(e.data);
            appendConsoleLog(`Stage 1 Done. Parsed ${data.pageCount} pages, ${data.charCount} characters.`, "success");
            
            // Populate Stage 1 View
            parseCharCount.textContent = data.charCount.toLocaleString();
            parsePageCount.textContent = data.pageCount;
            parsedTextPreview.textContent = data.preview;
            
            // Render breakdown
            pageBreakdownList.innerHTML = "";
            data.pages.forEach((page) => {
                const item = document.createElement("div");
                item.className = "page-breakdown-item";
                item.innerHTML = `
                    <span class="page-num">Page ${page.pageNumber}</span>
                    <span class="page-chars">${page.charCount.toLocaleString()} chars</span>
                `;
                pageBreakdownList.appendChild(item);
            });
        });

        eventSource.addEventListener("embedding_start", () => {
            appendConsoleLog("STAGE 2: Generating Vector Embeddings...", "info");
        });

        eventSource.addEventListener("ingestion_complete", (e) => {
            const data = JSON.parse(e.data);
            appendConsoleLog(`STAGE 2 Completed successfully. Stored ${data.chunkCount} chunks with dimensions: ${data.dimension}.`, "success");
            
            embedChunkCount.textContent = data.chunkCount;
            embedVectorDim.textContent = data.dimension;

            showToast("Ingestion completed successfully!");
            eventSource.close();
            refreshFilesList();
        });

        eventSource.addEventListener("error", (e) => {
            let message = "Unknown ingestion error occurred.";
            if (e.data) {
                try {
                    const data = JSON.parse(e.data);
                    message = data.message || message;
                } catch (parseErr) {}
            }
            appendConsoleLog(`[ERROR] ${message}`, "error");
            showToast("Ingestion pipeline failed.", "error");
            eventSource.close();
            refreshFilesList();
        });
    }

    function appendConsoleLog(message, type = "normal") {
        const line = document.createElement("span");
        line.className = `console-line ${type}`;
        line.textContent = message;
        embedLogsConsole.appendChild(line);
        embedLogsConsole.scrollTop = embedLogsConsole.scrollHeight;
    }

    // Update active document fields and Sandbox state
    function updateActiveDocumentUI() {
        const activeFile = files.find((f) => f._id === activeFileId);
        
        if (activeFile && activeFile.status === "completed") {
            activeDocLabel.textContent = `Active: ${activeFile.originalName}`;
            sandboxInput.disabled = false;
            sandboxSendBtn.disabled = false;
            sandboxInput.placeholder = "Ask a question about the active PDF...";

            // Auto-populate inspector tabs with selected file specs
            parseCharCount.textContent = activeFile.charCount.toLocaleString();
            parsePageCount.textContent = activeFile.pageCount;
            embedChunkCount.textContent = activeFile.chunkCount;
            embedVectorDim.textContent = "384 (Xenova)";

            // Page breakdown rendering
            pageBreakdownList.innerHTML = "";
            if (activeFile.pages && activeFile.pages.length > 0) {
                activeFile.pages.forEach((p) => {
                    const item = document.createElement("div");
                    item.className = "page-breakdown-item";
                    item.innerHTML = `
                        <span class="page-num">Page ${p.pageNumber}</span>
                        <span class="page-chars">${p.charCount.toLocaleString()} chars</span>
                    `;
                    // On click breakdown page, render preview of that specific page text
                    item.addEventListener("click", () => {
                        parsedTextPreview.textContent = p.text || "[Empty Page]";
                    });
                    pageBreakdownList.appendChild(item);
                });

                // Set preview to first page initially
                parsedTextPreview.textContent = activeFile.pages[0].text || "[Empty Page]";
            } else {
                parsedTextPreview.textContent = "No page texts recorded.";
            }

            // Populate embed logs
            embedLogsConsole.innerHTML = "";
            if (activeFile.logs && activeFile.logs.length > 0) {
                activeFile.logs.forEach((logLine) => {
                    const span = document.createElement("span");
                    span.className = "console-line";
                    span.textContent = logLine;
                    embedLogsConsole.appendChild(span);
                });
            } else {
                embedLogsConsole.innerHTML = '<span class="console-placeholder">Logs loaded from DB.</span>';
            }

        } else {
            activeDocLabel.textContent = "No Active Document";
            sandboxInput.disabled = true;
            sandboxSendBtn.disabled = true;
            sandboxInput.value = "";
            sandboxInput.placeholder = "Please ingest and select an active PDF first.";

            // Reset stats
            parseCharCount.textContent = "-";
            parsePageCount.textContent = "-";
            pageBreakdownList.innerHTML = `<p class="placeholder-text">Ingest a PDF to inspect its page breakdown.</p>`;
            parsedTextPreview.textContent = "Ingest a PDF to view extracted text preview.";
            embedChunkCount.textContent = "-";
            embedVectorDim.textContent = "-";
            embedLogsConsole.innerHTML = '<span class="console-placeholder">Waiting for ingestion run...</span>';
        }
    }

    // ------------------------------------------------------------------------
    // Stage 3: Isolated QA Sandbox & Chunks Retrieval
    // ------------------------------------------------------------------------

    sandboxSendBtn.addEventListener("click", submitSandboxQuery);
    sandboxInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submitSandboxQuery();
        }
    });

    async function submitSandboxQuery() {
        const queryText = sandboxInput.value.trim();
        if (!queryText || !activeFileId) return;

        // Clear input
        sandboxInput.value = "";
        sandboxInput.disabled = true;
        sandboxSendBtn.disabled = true;

        // Append User bubble to chat
        appendChatBubble("user", queryText);

        // Prepare bot bubble
        const botBubble = appendChatBubble("bot", "Thinking...");
        const botContentEl = botBubble.querySelector(".bubble-content");

        // Clear retrieval panel and select the tab
        retrievalLogs.innerHTML = '<p class="placeholder-text">Retrieving matching document chunks...</p>';

        try {
            const response = await fetch("/api/inspector/query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ queryText, fileId: activeFileId }),
            });

            if (!response.ok) {
                const errResult = await response.json();
                botContentEl.textContent = `Error: ${errResult.error || "Query failed"}`;
                sandboxInput.disabled = false;
                sandboxSendBtn.disabled = false;
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let assembledText = "";

            botContentEl.textContent = "";

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const jsonStr = line.slice(6).trim();
                    if (!jsonStr) continue;

                    try {
                        const payload = JSON.parse(jsonStr);
                        if (payload.type === "token") {
                            assembledText += payload.token;
                            // Format response text formatting inline citations nicely
                            botContentEl.innerHTML = formatResponseHTML(assembledText);
                            sandboxChatArea.scrollTop = sandboxChatArea.scrollHeight;
                        } else if (payload.type === "done") {
                            // Stage 3: Retrieval details rendered
                            renderRetrievalResults(payload.chunks);
                        }
                    } catch (e) {
                        // Skip parse errors
                    }
                }
            }

        } catch (err) {
            console.error("QA Query error:", err);
            botContentEl.textContent = `System Error: ${err.message}`;
        } finally {
            sandboxInput.disabled = false;
            sandboxSendBtn.disabled = false;
            sandboxInput.focus();
        }
    }

    function appendChatBubble(role, content) {
        // Remove welcome message if first message
        const welcome = sandboxChatArea.querySelector(".system-welcome-msg");
        if (welcome) welcome.remove();

        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${role}`;
        bubble.innerHTML = `
            <span class="bubble-sender">${role === "user" ? "You" : "Document Assistant"}</span>
            <div class="bubble-content">${role === "user" ? escapeHtml(content) : formatResponseHTML(content)}</div>
        `;
        sandboxChatArea.appendChild(bubble);
        sandboxChatArea.scrollTop = sandboxChatArea.scrollHeight;
        return bubble;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatResponseHTML(text) {
        // Citation tag formatting [Page X] or (Page X) or [Source X] -> custom badge
        let html = escapeHtml(text);
        
        // Match [Page X] or [page X]
        html = html.replace(/\[[Pp]age\s+(\d+)\]/g, '<span class="citation-tag">Page $1</span>');
        
        // Match linebreaks
        html = html.replace(/\n/g, "<br>");
        return html;
    }

    function renderRetrievalResults(chunks) {
        retrievalLogs.innerHTML = "";

        if (!chunks || chunks.length === 0) {
            retrievalLogs.innerHTML = '<p class="placeholder-text">No relevant chunks passed the similarity threshold.</p>';
            return;
        }

        // Highlight tab for Stage 3: Retrieval
        tabBtns.forEach((b) => b.classList.remove("active"));
        tabPanels.forEach((p) => p.classList.remove("active"));
        document.querySelector('[data-tab="retrievalTab"]').classList.add("active");
        document.getElementById("retrievalTab").classList.add("active");

        chunks.forEach((chunk, index) => {
            const card = document.createElement("div");
            card.className = "retrieved-chunk-card";

            const simPercentage = (chunk.similarity * 100).toFixed(1);
            let simClass = "sim-low";
            if (chunk.similarity >= 0.7) simClass = "sim-high";
            else if (chunk.similarity >= 0.4) simClass = "sim-med";

            const pageNum = chunk.metadata.pageNumber || "unknown";
            const chunkIndex = chunk.metadata.chunkNumber || chunk.metadata.childNumber || index + 1;

            card.innerHTML = `
                <div class="chunk-header-row">
                    <span class="chunk-badge">Chunk ${chunkIndex} (Page ${pageNum})</span>
                    <span class="similarity-badge ${simClass}">${simPercentage}% Match</span>
                </div>
                <div class="chunk-body">${escapeHtml(chunk.text)}</div>
            `;
            retrievalLogs.appendChild(card);
        });
    }

});
