chrome.storage.local.remove(["url_num", "domain_list", "js_url_list", "ip_list", "isBlacklisted"], () => {
    let url_num = 0;
    const currentPageHostname = window.location.hostname.toLowerCase();
    const domainBlacklist = new Set();

    const fullHtml = document.documentElement.outerHTML;
    const scripts = Array.from(document.querySelectorAll("script[src]"));
    const inlineScripts = Array.from(document.querySelectorAll("script:not([src])"));

    const regex_domain = /(?:"|')((?:[a-zA-Z]{1,10}:\/\/|\/\/)[^"'/]+\.[a-zA-Z]{2,})(?:[\/'"?])/g;
    const regex_url = /(?:"|')(((?:\/|%2[Ff]|%3[Cc])[^"'><,;| *()(%%$^/\\\[\]][^"'><,;|()]{1,})|([a-zA-Z0-9_\-/]{1,}\/[a-zA-Z0-9_\-/]{1,}\.(?:[a-zA-Z]{1,4}|action)(?:[\?|/][^"|']{0,}|))|([a-zA-Z0-9_\-]{1,}\.(?:php|asp|aspx|jsp|json|action|html|txt|xml)(?:\?[^"|']{0,}|)))(?:"|')/g;
    const regex_ip = /\b((?:\d{1,3}\.){3}\d{1,3})(?::([1-9][0-9]{0,4}))?\b/g;

    //敏感信息
    const sensitiveRegex = {
        email: /\b[A-Za-z0-9._\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,61}\b/g,
        phone: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
        aliyunKey: /\bLTAI[A-Za-z\d]{12,30}\b/g,
        tencentKey: /\bAKID[A-Za-z\d]{13,40}\b/g,
        jingdongKey: /\bJDC_[0-9A-Z]{25,40}\b/g,
        awsKey: /'["''](?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}["'']'/g,
        huoshanKey: /\b(?:AKLT|AKTP)[a-zA-Z0-9]{35,50}\b/g,
        jinshanKey: /\bAKLT[a-zA-Z0-9-_]{16,28}\b/g,
        googleKey: /\bAIza[0-9A-Za-z_\-]{35}\b/g,
        idCard: /\b\d{6}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g,
        cookie: /\b(?:cookie|set-cookie)\s*[:=]\s*[^;]+/gi,
        url: /\bhttps?:\/\/[^\s"'<>]+/gi,
        jwt: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9._-]{10,}\b/g,
        token: /\b(?:token|access_token|auth_token)[\s"':=]{0,10}[A-Za-z0-9\-_]{10,}\b/gi
    };

    // URL敏感信息的黑名单后缀
    const urlSensitiveBlacklist = /\.(jpg|jpeg|png|gif|bmp|webp|svg|css)(\?|$)/i;

    const domainSet = new Set();
    const absUrlList = new Set();
    const relUrlList = new Set();
    const ipSet = new Set();
    // 敏感信息存储对象
    const sensitiveInfo = {
        email: new Set(),
        phone: new Set(),
        aliyunKey: new Set(),
        tencentKey: new Set(),
        jingdongKey: new Set(),
        awsKey: new Set(),
        huoshanKey: new Set(),
        jinshanKey: new Set(),
        googleKey: new Set(),
        idCard: new Set(),
        cookie: new Set(),
        url: new Set(),
        jwt: new Set(),
        token: new Set()
    };

    chrome.storage.local.get(["blacklist_domains"], (res) => {
        if (res.blacklist_domains && res.blacklist_domains.length) {
            res.blacklist_domains.forEach(domain => domainBlacklist.add(domain));
        }

        function isBlacklisted(hostname) {
            const lowerHost = hostname.toLowerCase();
            return Array.from(domainBlacklist).some(bl => lowerHost === bl || lowerHost.endsWith("." + bl));
        }

        const isCurrentPageBlacklisted = isBlacklisted(currentPageHostname);

        if (isCurrentPageBlacklisted) {
            chrome.storage.local.get(["data_by_domain"], (res) => {
                const allData = res.data_by_domain || {};
                allData[currentPageHostname] = {
                    domain_list: [],
                    js_url_list: [],
                    ip_list: [],
                    sensitive_info: {},
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
            return;
        }

        function isValidIp(ip) {
            const parts = ip.split('.');
            return parts.length === 4 && parts.every(part => {
                const num = parseInt(part, 10);
                return !isNaN(num) && num >= 0 && num <= 255 && String(num) === part;
            });
        }

        // 敏感信息提取
        function extractSensitiveInfo(code) {
            for (const [type, regex] of Object.entries(sensitiveRegex)) {
                let match;
                while ((match = regex.exec(code)) !== null) {
                    // 对URL类型的敏感信息进行黑名单过滤
                    if (type === 'url') {
                        if (!urlSensitiveBlacklist.test(match[0])) {
                            sensitiveInfo[type].add(match[0]);
                        }
                    } else {
                        sensitiveInfo[type].add(match[0]);
                    }
                }
            }
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
                        // 过滤指定前缀的结果
                        const ignoredDomainsOrPaths = ["http://", "https://"];
                        if (ignoredDomainsOrPaths.some(prefix => fullUrl.startsWith(prefix))) continue;
                        absUrlList.add(fullUrl);
                    } catch (e) { }
                } else {
                    // 过滤指定前缀的结果
                    const ignoredPrefixes = ["http://", "https://"];
                    if (ignoredPrefixes.some(prefix => url.startsWith(prefix))) continue;
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
                } catch (e) { }
            }

            while ((match = regex_ip.exec(code)) !== null) {
                const ip = match[1];
                const port = match[2];
                if (isValidIp(ip)) {
                    const fullIp = port ? `${ip}:${port}` : ip;
                    ipSet.add(fullIp);
                }
            }

            // 调用敏感信息提取
            extractSensitiveInfo(code);

            // 解析 HTML 属性中的接口路径
            const domParser = new DOMParser();
            try {
                const doc = domParser.parseFromString(code, "text/html");
                const elements = doc.querySelectorAll("*");
                elements.forEach(el => {
                    Array.from(el.attributes).forEach(attr => {
                        const val = attr.value;
                        if (typeof val === "string" && regex_url.test(`"${val}"`)) {
                            extractFromCode(`"${val}"`);
                        }
                    });
                });
            } catch (e) { }
        }

        function extractFromStaticTags() {
            const tagsWithUrls = [
                ["a", "href"],
                ["link", "href"],
                ["img", "src"],
                ["script", "src"],
                ["iframe", "src"],
                ["form", "action"],
                ["source", "src"],
                ["video", "src"]
            ];

            tagsWithUrls.forEach(([tag, attr]) => {
                document.querySelectorAll(`${tag}[${attr}]`).forEach(el => {
                    const val = el.getAttribute(attr);
                    if (val && typeof val === "string" && regex_url.test(`"${val}"`)) {
                        extractFromCode(`"${val}"`);
                    }
                });
            });
        }

        function handleResults(isBlacklistedFlag) {
            const domain_list = Array.from(domainSet);
            const js_url_list = [...absUrlList, ...relUrlList];
            const ip_list = Array.from(ipSet);
            // 处理敏感信息为数组
            const sensitive_info = Object.fromEntries(
                Object.entries(sensitiveInfo).map(([key, set]) => [key, Array.from(set)])
            );
            url_num = js_url_list.length;

            chrome.storage.local.get(["data_by_domain"], (res) => {
                const allData = res.data_by_domain || {};
                allData[currentPageHostname] = {
                    domain_list,
                    js_url_list,
                    ip_list,
                    sensitive_info,
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

        extractFromCode(fullHtml);
        inlineScripts.forEach(script => extractFromCode(script.textContent));
        extractFromStaticTags(); // 扫描页面静态标签的 URL 属性

        const fetchTasks = scripts
            .filter(script => {
                try {
                    const srcHostname = new URL(script.src).hostname;
                    return !isBlacklisted(srcHostname);
                } catch (e) { return false; }
            })
            .map(script => fetch(script.src).then(res => res.text()).then(extractFromCode).catch(() => { }));

        Promise.all(fetchTasks).then(() => handleResults(false));
    });
});