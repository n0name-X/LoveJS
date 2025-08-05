chrome.storage.local.remove(["url_num", "domain_list", "js_url_list", "ip_list", "isBlacklisted"], () => {
    let url_num = 0;
    const currentPageHostname = window.location.hostname.toLowerCase();
    const domainBlacklist = new Set();

    const fullHtml = document.documentElement.outerHTML;
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));

    const regex_domain = /(?:"|')((?:[a-zA-Z]{1,10}:\/\/|\/\/)[^"'/]+\.[a-zA-Z]{2,})(?:[\/'"?])/g;
    const regex_url = /(?:"|')(((?:\/|\.\.\/|\.\.\/)[^"'><,;| *()(%%$^/\\\[\]][^"'><,;|()]{1,})|([a-zA-Z0-9_\-/]{1,}\/[a-zA-Z0-9_\-/]{1,}\.(?:[a-zA-Z]{1,4}|action)(?:[\?|/][^"|']{0,}|))|([a-zA-Z0-9_\-]{1,}\.(?:php|asp|aspx|jsp|json|action|html|txt|xml)(?:\?[^"|']{0,}|)))(?:"|')/g;
    const regex_ip = /\b((?:\d{1,3}\.){3}\d{1,3})(?::([1-9][0-9]{0,4}))?\b/g;

    const domainSet = new Set();
    const absUrlList = new Set();
    const relUrlList = new Set();
    const ipSet = new Set();

    chrome.storage.local.get(["blacklist_domains"], (res) => {
        if (res.blacklist_domains && res.blacklist_domains.length) {
            res.blacklist_domains.forEach(domain => domainBlacklist.add(domain));
        }

        // 黑名单判断函数
        function isBlacklisted(hostname) {
            const lowerHost = hostname.toLowerCase();
            return Array.from(domainBlacklist).some(bl => lowerHost === bl || lowerHost.endsWith("." + bl));
        }

        // 当前页面是否被拉黑
        const isCurrentPageBlacklisted = isBlacklisted(currentPageHostname);

        // 黑名单命中则立即终止处理，仅设置空数据并提示
        if (isCurrentPageBlacklisted) {
            chrome.storage.local.get(["data_by_domain"], (res) => {
                const allData = res.data_by_domain || {};
                allData[currentPageHostname] = {
                    domain_list: [],
                    js_url_list: [],
                    ip_list: [],
                    url_num: 0,
                    isBlacklisted: true
                };
                chrome.storage.local.set({ data_by_domain: allData }, () => {
                    chrome.runtime.sendMessage({
                        type: "scanComplete",
                        hostname: currentPageHostname
                    });
                });
            });
            return; // 终止后续处理
        }

        // 非黑名单域名，继续正常提取逻辑
        function isValidIp(ip) {
            const parts = ip.split('.');
            return parts.length === 4 && parts.every(part => {
                const num = parseInt(part, 10);
                return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
            });
        }

        function extractFromCode(code) {
            let match;
            const excludeExtRegex = /\.(jpg|jpeg|png|gif|bmp|webp|svg|css|js|woff2?|ttf|eot|ts)(\?|$)/i;

            while ((match = regex_url.exec(code)) !== null) {
                const url = match[1];
                if (excludeExtRegex.test(url)) continue;
                if (/^(https?:\/\/|\/\/)/.test(url)) {
                    try {
                        const fullUrl = url.startsWith("//") ? "http:" + url : url;
                        const hostname = new URL(fullUrl).hostname;
                        if (isBlacklisted(hostname)) continue;
                        absUrlList.add(fullUrl);
                    } catch (e) {}
                } else {
                    relUrlList.add(url);
                }
            }

            while ((match = regex_domain.exec(code)) !== null) {
                let url = match[1];
                if (url.startsWith("//")) url = "http:" + url;
                else if (!/^https?:\/\//.test(url)) url = "http://" + url;
                try {
                    const hostname = new URL(url).hostname;
                    if (isBlacklisted(hostname)) continue;
                    domainSet.add(hostname);
                } catch (e) {}
            }

            while ((match = regex_ip.exec(code)) !== null) {
                const ip = match[1];
                const port = match[2];
                if (isValidIp(ip)) {
                    const fullIp = port ? `${ip}:${port}` : ip;
                    ipSet.add(fullIp);
                }
            }
        }

        function handleResults(isBlacklistedFlag) {
            const domain_list = Array.from(domainSet);
            const js_url_list = [...absUrlList, ...relUrlList];
            const ip_list = Array.from(ipSet);
            url_num = js_url_list.length;

            chrome.storage.local.get(["data_by_domain"], (res) => {
                const allData = res.data_by_domain || {};
                allData[currentPageHostname] = {
                    domain_list,
                    js_url_list,
                    ip_list,
                    url_num,
                    isBlacklisted: isBlacklistedFlag
                };
                chrome.storage.local.set({ data_by_domain: allData }, () => {
                    chrome.runtime.sendMessage({
                        type: "scanComplete",
                        hostname: currentPageHostname
                    });
                });
            });
        }

        // 开始处理非黑名单站点
        extractFromCode(fullHtml);
        inlineScripts.forEach(script => extractFromCode(script.textContent));
        const fetchTasks = scripts
            .filter(script => {
                try {
                    const srcHostname = new URL(script.src).hostname;
                    return !isBlacklisted(srcHostname);
                } catch (e) { return false; }
            })
            .map(script => fetch(script.src).then(res => res.text()).then(extractFromCode).catch(() => {}));

        Promise.all(fetchTasks).then(() => handleResults(false));
    });
});

