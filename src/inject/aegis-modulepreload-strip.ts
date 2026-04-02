const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (
        node instanceof HTMLLinkElement &&
        node.rel === "modulepreload"
      ) {
        node.remove();
      }
    }
  }
});
observer.observe(document, { childList: true, subtree: true });
document.addEventListener("DOMContentLoaded", () => observer.disconnect(), { once: true });
