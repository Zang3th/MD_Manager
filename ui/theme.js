window.MDManager = window.MDManager || {};

(function (app) {
  const themes = [
    { id: "gruvbox-dark", label: "Dark Mode", icon: "☾" },
    { id: "gruvbox-light", label: "Light Mode", icon: "☀" }
  ];
  let currentIndex = 0;
  const button = document.getElementById("toggleTheme");

  function apply() {
    const current = themes[currentIndex];
    const next = themes[(currentIndex + 1) % themes.length];
    document.body.dataset.theme = current.id;
    button.querySelector("span").textContent = next.icon;
    button.setAttribute("aria-label", `Switch to ${next.label}`);
    button.title = `Switch to ${next.label}`;
  }

  function next() {
    currentIndex = (currentIndex + 1) % themes.length;
    apply();
  }

  button.addEventListener("click", next);
  apply();

  app.theme = { themes, next };
})(window.MDManager);
