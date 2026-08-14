window.MDManager = window.MDManager || {};

(function (app) {
  const themes = [
    { id: "gruvbox-dark", label: "Dark Mode", icon: '<svg class="ui-icon" viewBox="0 0 32 32"><use href="#icon-moon"></use></svg>' },
    { id: "gruvbox-light", label: "Light Mode", icon: '<svg class="ui-icon" viewBox="0 0 32 32"><use href="#icon-sun"></use></svg>' }
  ];
  let currentIndex = 0;
  const button = document.getElementById("toggleTheme");

  function apply() {
    const current = themes[currentIndex];
    const next = themes[(currentIndex + 1) % themes.length];
    document.body.dataset.theme = current.id;
    button.querySelector(".theme-icon").innerHTML = next.icon;
    button.setAttribute("aria-label", `Switch to ${next.label}`);
    button.dataset.tooltip = `Switch to ${next.label}`;
  }

  function next() {
    currentIndex = (currentIndex + 1) % themes.length;
    apply();
  }

  button.addEventListener("click", next);
  apply();

  app.theme = { next };
})(window.MDManager);
