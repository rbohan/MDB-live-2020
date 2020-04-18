// call this function to 'unpause' clusters
exports = function()
{
  const project = context.values.get(`auto-project`);
  const username = context.values.get(`auto-username`);
  const password = context.values.get(`auto-password`);
  const clusters = context.values.get(`auto-clusters`);

  return context.functions.execute("modifyClusters", project, username, password, clusters, { "paused": false });
};
