// ============================================
// SEARCH.JS — Global search bar in the topbar.
// Searches students, teachers, classes and fees
// and lets the user click a result to jump to
// that module's page.
// ============================================
document.addEventListener("DOMContentLoaded", () => {
    const search = document.getElementById("globalSearch");
    const results = document.getElementById("searchResults");

    if (!search || !results) return;

    let debounceTimer = null;

    search.addEventListener("keyup", () => {
        clearTimeout(debounceTimer);
        const keyword = search.value.trim();

        if (keyword.length < 2) {
            results.style.display = "none";
            results.innerHTML = "";
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(keyword)}`);
                const data = await response.json();

                results.innerHTML = "";

                if (!Array.isArray(data) || data.length === 0) {
                    results.innerHTML = "<div class='search-item' style='padding:10px 12px; color:#94a3b8; font-size:13px;'>No record found</div>";
                } else {
                    data.forEach(item => {
                        const row = document.createElement("div");
                        row.className = "search-item";
                        row.style.cssText = "padding:10px 12px; cursor:pointer; border-bottom:1px solid #334155; font-size:13px;";
                        row.innerHTML = `
                            <strong>${escapeHtml(item.name || "")}</strong>
                            <span style="color:#64748b; font-size:11px; margin-left:6px;">${escapeHtml(item.type || "")}</span>
                            <br><small style="color:#94a3b8;">${escapeHtml(item.subtitle || "")}</small>
                        `;
                        row.addEventListener("mouseenter", () => row.style.background = "#334155");
                        row.addEventListener("mouseleave", () => row.style.background = "transparent");
                        row.addEventListener("click", () => {
                            results.style.display = "none";
                            search.value = "";
                            if (item.page && typeof loadPage === "function") {
                                loadPage(item.page);
                            }
                        });
                        results.appendChild(row);
                    });
                }

                results.style.display = "block";
            } catch (err) {
                results.style.display = "none";
            }
        }, 250);
    });

    // Close dropdown when clicking anywhere outside the search box
    document.addEventListener("click", (e) => {
        if (!e.target.closest("#globalSearchWrap")) {
            results.style.display = "none";
        }
    });
});
