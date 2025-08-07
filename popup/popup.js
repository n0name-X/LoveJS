document.addEventListener('DOMContentLoaded', function () {
  let tabs = document.querySelectorAll('.tab');
  let contents = document.querySelectorAll('.tab-content');
  let currentPageUrl = '';

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(this.dataset.tab).classList.add('active');
    });
  });

  let subTabs = document.querySelectorAll('.sub-tab');
  let subContents = document.querySelectorAll('.sub-content-panel');

  subTabs.forEach(tab => {
    tab.addEventListener('click', function () {
      subTabs.forEach(t => t.classList.remove('active'));
      subContents.forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(this.dataset.sub).classList.add('active');
    });
  });

  const domainContainer = document.getElementById("domain_list");
  const urlContainer = document.getElementById("url_list");
  const ipContainer = document.getElementById("ip_list");
  const sensitiveContainer = document.getElementById("sensitive_list"); // 敏感信息容器

  domainContainer.innerHTML = "";
  urlContainer.innerHTML = "";
  ipContainer.innerHTML = "";
  sensitiveContainer.innerHTML = ""; // 初始化敏感信息容器

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = new URL(tabs[0].url);
    const hostname = url.hostname.toLowerCase();
    currentPageUrl = tabs[0].url;

    chrome.storage.local.get(["data_by_domain"], (res) => {
      const allData = res.data_by_domain || {};
      const result = allData[hostname] || {};

      const domainList = result.domain_list || [];
      const jsUrlList = result.js_url_list || [];
      const ipList = result.ip_list || [];
      const sensitiveInfo = result.sensitive_info || {}; // 获取敏感信息
      const isBlacklisted = result.isBlacklisted || false;

      const render = (container, items) => {
        container.innerHTML = "";
        items.forEach(item => {
          const p = document.createElement("p");
          p.textContent = item;
          container.appendChild(p);
        });
      };

      // 敏感信息渲染函数
      const renderSensitive = (container, info) => {
        container.innerHTML = "";
        const types = {
          email: "邮箱",
          phone: "手机号",
          aliyunKey: "阿里云key",
          tencentKey: "腾讯云key",
          jingdongKey: "京东云key",
          awsKey: "亚马逊云key",
          huoshanKey: "火山云key",
          jinshanKey: "金山云key",
          googleKey: "谷歌云key"
        };

        let hasContent = false;
        
        for (const [type, label] of Object.entries(types)) {
          if (info[type] && info[type].length > 0) {
            hasContent = true;
            const header = document.createElement("div");
            header.style.fontWeight = "bold";
            header.style.marginTop = "10px";
            header.style.color = "#2c3e50";
            header.textContent = `${label} (${info[type].length})`;
            container.appendChild(header);
            
            info[type].forEach(item => {
              const p = document.createElement("p");
              p.textContent = item;
              p.style.marginTop = "5px";
              container.appendChild(p);
            });
          }
        }
        
        if (!hasContent) {
          const p = document.createElement("p");
          p.textContent = "未发现敏感信息";
          p.style.color = "#666";
          container.appendChild(p);
        }
      };

      if (isBlacklisted) {
        const tip = document.createElement("p");
        tip.textContent = "域名在黑名单中，不处理";
        tip.style.color = "#ff6b6b";
        domainContainer.appendChild(tip);
        urlContainer.appendChild(tip.cloneNode(true));
        ipContainer.appendChild(tip.cloneNode(true));
        sensitiveContainer.appendChild(tip.cloneNode(true)); // 敏感信息面板添加提示
      } else {
        render(domainContainer, domainList);
        render(urlContainer, jsUrlList);
        render(ipContainer, ipList);
        renderSensitive(sensitiveContainer, sensitiveInfo); // 渲染敏感信息
      }
    });
  });

  // 复制域名按钮
  document.getElementById('copyBtn').addEventListener('click', () => {
    const texts = Array.from(document.querySelectorAll('#domain_list p')).map(p => p.textContent);
    navigator.clipboard.writeText(texts.join('\n')).catch(err => console.error('复制失败:', err));
  });

  // 复制IP按钮
  document.getElementById('copyIpBtn').addEventListener('click', () => {
    const texts = Array.from(document.querySelectorAll('#ip_list p')).map(p => p.textContent);
    navigator.clipboard.writeText(texts.join('\n')).catch(err => console.error('复制失败:', err));
  });

  // 复制接口路径按钮
  document.getElementById('copyPathBtn').addEventListener('click', () => {
    const texts = Array.from(document.querySelectorAll('#url_list p')).map(p => p.textContent);
    navigator.clipboard.writeText(texts.join('\n')).catch(err => console.error('复制失败:', err));
  });

  // 复制完整URL按钮
  document.getElementById('copyFullUrlBtn').addEventListener('click', () => {
    if (!currentPageUrl) return;

    try {
      const baseUrl = new URL(currentPageUrl);
      const baseDomain = `${baseUrl.protocol}//${baseUrl.hostname}`;

      chrome.storage.local.get(["base_path"], (res) => {
        const basePath = res.base_path || "";
        const cleanPath = basePath.startsWith("/") ? basePath : "/" + basePath;

        const texts = Array.from(document.querySelectorAll('#url_list p')).map(p => {
          const path = p.textContent;
          if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("//")) {
            return path;
          }
          return path.startsWith("/") ?
            `${baseDomain}${cleanPath}${path}`.replace(/\/{2,}/g, "/").replace(":/", "://") :
            `${baseDomain}${cleanPath}/${path}`.replace(/\/{2,}/g, "/").replace(":/", "://");
        });

        navigator.clipboard.writeText(texts.join('\n')).catch(err => console.error('复制失败:', err));
      });

    } catch (err) {
      console.error('处理URL失败:', err);
    }
  });

  // URL多开功能
  document.getElementById('openAllUrls').addEventListener('click', () => {
    const textarea = document.getElementById('urlMultiInput');
    const urls = textarea.value.split('\n')
      .map(url => url.trim())
      .filter(url => url); // 过滤空行

    urls.forEach(url => {
      // 补全协议头
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'http://' + url;
      }
      // 在新标签页打开URL
      chrome.tabs.create({ url: url, active: false });
    });
  });

  // 清空输入按钮
  document.getElementById('clearUrls').addEventListener('click', () => {
    document.getElementById('urlMultiInput').value = '';
  });

  // 读取黑名单和基础目录配置
  chrome.storage.local.get(["blacklist_domains", "base_path", "notepad_content"], (res) => {
    const blacklist = res.blacklist_domains || [];
    const basePath = res.base_path || "";
    const noteContent = res.notepad_content || "";

    document.getElementById("blacklistInput").value = blacklist.join("\n");
    document.getElementById("basePathInput").value = basePath;
    document.getElementById("notepadInput").value = noteContent;
  });

  // 保存黑名单
  document.getElementById("saveBlacklistBtn").addEventListener("click", () => {
    const raw = document.getElementById("blacklistInput").value.trim();
    const list = raw.split("\n").map(i => i.trim()).filter(i => i);
    chrome.storage.local.set({ blacklist_domains: list }, () => {
      alert("黑名单保存成功");
    });
  });

  // 保存基础目录
  document.getElementById("saveBasePathBtn").addEventListener("click", () => {
    const base = document.getElementById("basePathInput").value.trim();
    chrome.storage.local.set({ base_path: base }, () => {
      alert("基础目录保存成功");
    });
  });

  // 记事本功能 - 保存笔记
  document.getElementById("saveNoteBtn").addEventListener("click", () => {
    const content = document.getElementById("notepadInput").value;
    chrome.storage.local.set({ notepad_content: content }, () => {
      alert("笔记保存成功");
    });
  });

  // 记事本功能 - 清空笔记
  document.getElementById("clearNoteBtn").addEventListener("click", () => {
    if (confirm("确定要清空笔记吗？")) {
      document.getElementById("notepadInput").value = "";
      chrome.storage.local.set({ notepad_content: "" });
    }
  });

});