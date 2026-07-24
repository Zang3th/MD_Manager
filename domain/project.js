window.MDManager = window.MDManager || {};

(function (app) {
  function moveItem(items, fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    items.splice(toIndex, 0, items.splice(fromIndex, 1)[0]);
  }

  app.domain = {
    moveRelease(project, fromIndex, toIndex) {
      moveItem(project.releases, fromIndex, toIndex);
    },
    moveFeature(project, fromRelease, fromIndex, toRelease, toIndex) {
      const feature = project.releases[fromRelease].features.splice(fromIndex, 1)[0];
      project.releases[toRelease].features.splice(toIndex, 0, feature);
    },
    moveCard(project, fromRelease, fromFeature, fromIndex, toRelease, toFeature, toIndex) {
      const card = project.releases[fromRelease].features[fromFeature].cards.splice(fromIndex, 1)[0];
      project.releases[toRelease].features[toFeature].cards.splice(toIndex, 0, card);
    },
    setTodo(card, lineIndex, checked) {
      card.lines[lineIndex] = card.lines[lineIndex].replace(
        /^(\s*[-*+]\s+)(?:\[[ xX]\]\s+)?/,
        `$1[${checked ? "x" : " "}] `
      );
    }
  };
})(window.MDManager);
