window.MDManager = window.MDManager || {};

(function (app) {
  const featureMarkdown = `## New Feature

#Version
- 0.1.0

#Date
- DD.MM.YYYY

#Info
Describe the goal of this release.

#Warn
Describe where to be careful.

### New Task

#Info
Describe the expected result.

#Warn
Describe where to be careful.

#### Checklist
- [ ] Complete the work
- [ ] Verify the result

#### Definition of Done
- [ ] Write tests
- [ ] Add documentation
- [ ] Code Review
`;
  const taskMarkdown = `### New Task

#Info
Describe the expected result.

#Warn
Describe where to be careful.

#### Checklist
- [ ] Complete the work
- [ ] Verify the result

#### Definition of Done
- [ ] Write tests
- [ ] Add documentation
- [ ] Code Review
`;

  app.templates = {
    sources: { feature: featureMarkdown, task: taskMarkdown },
    /** @returns {MDFeature} */
    feature() {
      return app.markdown.parse(`# Template Project\n\n${featureMarkdown}`).features[0];
    },
    /** @returns {MDTask} */
    task() {
      return app.markdown.parse(`# Template Project\n\n## Template Feature\n\n${taskMarkdown}`).features[0].tasks[0];
    }
  };
})(window.MDManager);
