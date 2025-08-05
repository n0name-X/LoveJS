// 显式指定 tabId 来更新徽章
function updateBadgeFor(hostname, tabId) {
  chrome.storage.local.get(["data_by_domain"], (res) => {
    const allData = res.data_by_domain || {};
    const domainData = allData[hostname] || {};
    const num = domainData.url_num || 0;

    const badgeOptions = {
      text: num.toString(),
      tabId: tabId
    };
    chrome.action.setBadgeText(badgeOptions);
    chrome.action.setBadgeBackgroundColor({ color: '#303030', tabId });
    chrome.action.setBadgeTextColor?.({ color: '#FFFFFF', tabId });
  });
}

// 接收来自 content.js 的消息
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "scanComplete" && msg.hostname) {
    const tabId = sender?.tab?.id;
    console.log("更新徽章", msg.hostname, "tabId:", tabId);
    updateBadgeFor(msg.hostname, tabId);
  }
});
