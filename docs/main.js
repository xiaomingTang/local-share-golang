const RELEASE_URL =
  "https://github.com/xiaomingTang/local-share-golang/releases/latest";

function copyText(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
  return Promise.resolve();
}

function toast(message) {
  const el = document.createElement("div");
  el.textContent = message;
  el.style.position = "fixed";
  el.style.left = "50%";
  el.style.bottom = "22px";
  el.style.transform = "translateX(-50%)";
  el.style.padding = "10px 12px";
  el.style.borderRadius = "12px";
  el.style.border = "1px solid rgba(255,255,255,.14)";
  el.style.background = "rgba(0,0,0,.55)";
  el.style.backdropFilter = "blur(12px)";
  el.style.color = "rgba(255,255,255,.92)";
  el.style.fontWeight = "650";
  el.style.zIndex = "9999";
  el.style.boxShadow = "0 16px 40px rgba(0,0,0,.35)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

function buildFaqJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "只需要在一台 Windows 电脑下载并运行吗？其他设备也要装吗？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "是的。LocalShare 在 Windows 上启动共享服务；其他设备（手机、Mac 或其他电脑）无需安装客户端，只要在同一 Wi‑Fi/同一网络内用浏览器访问地址即可进行文件浏览、上传、下载和预览。",
        },
      },
      {
        "@type": "Question",
        name: "它是绿色软件吗？需要安装吗？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "是纯绿色免安装：下载后解压即用。删除程序文件夹即可卸载。唯一可能的系统改动来自可选的 Windows 右键菜单功能。",
        },
      },
      {
        "@type": "Question",
        name: "需要管理员权限吗？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "不需要。应用本身可直接运行；可选右键菜单仅写入当前用户注册表（HKCU），同样无需管理员权限。",
        },
      },
      {
        "@type": "Question",
        name: "删除应用后右键菜单残留怎么清理？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "建议：删除应用前先检查一下——如果曾启用过右键菜单，先在 LocalShare 界面里一键取消右键菜单，再删除应用会更省心。若已经删除应用，可删除 HKCU\\Software\\Classes\\Directory\\shell\\ShareFolder 与 HKCU\\Software\\Classes\\Directory\\Background\\shell\\ShareFolder 相关键，并重启资源管理器。页面 Q&A 提供了 reg.exe 命令与手动步骤。",
        },
      },
    ],
  };

  const el = document.getElementById("faqJsonLd");
  if (el) el.textContent = JSON.stringify(data);
}

function wireCopyButtons() {
  const btnCopyRelease = document.getElementById("btnCopyRelease");
  if (btnCopyRelease) {
    btnCopyRelease.addEventListener("click", async () => {
      await copyText(RELEASE_URL);
      toast("已复制下载链接");
    });
  }

  const btnCopyCleanup = document.getElementById("btnCopyCleanup");
  const cmdCleanup = document.getElementById("cmdCleanup");
  if (btnCopyCleanup && cmdCleanup) {
    btnCopyCleanup.addEventListener("click", async () => {
      await copyText(cmdCleanup.textContent.trim());
      toast("已复制清理命令");
    });
  }
}

function setYear() {
  const el = document.getElementById("year");
  if (el) el.textContent = String(new Date().getFullYear());
}

setYear();
buildFaqJsonLd();
wireCopyButtons();
