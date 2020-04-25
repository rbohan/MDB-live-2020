// main worker function which modifies clusters according to the details in the 'body' input parameter
exports = function(project, username, password, clusters, body)
{
  let promises = [];
  clusters.forEach(cluster => {
    // add a catch as we do not want the Promise to terminate early on error
    promises.push(modifyCluster(project, username, password, cluster, body)
      .catch(err => { return { "cluster": cluster, "error": err.message }; }));
  });
  return Promise.all(promises)
    .then(results => { return { "status": "success!", "results": results }; });
};

modifyCluster = function(project, username, password, cluster, body) {
  const args = { 
    "scheme": `https`, 
    "host": `cloud.mongodb.com`, 
    "path": `api/atlas/v1.0/groups/${project}/clusters/${cluster}`, 
    "username": username, 
    "password": password,
    "digestAuth": true,
    "headers": { "Content-Type": ["application/json"] }, 
    "body": JSON.stringify(body)
  };
  
  return context.http.patch(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw body.detail;
      return { "cluster": cluster, "response": body };
    });
};
