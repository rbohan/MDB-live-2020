exports = function(body){
  const project = context.values.get(`auto-project`);
  const username = context.values.get(`auto-username`);
  const password = context.values.get(`auto-password`);
  const clusters = context.values.get(`auto-clusters`);

  let promises = [];
  clusters.forEach(cluster => {
    // add a catch as we do not want the Promise to terminate early on error
    promises.push(modifyCluster(username, password, project, cluster, body)
      .catch(err => { return { "cluster": cluster, "error": err.message }; }));
  });
  return Promise.all(promises)
    .then(results => { return { "status": "success!", "results": results }; });
};

modifyCluster = function(username, password, project, cluster, body) {
  const args = { 
    "scheme": `https`, 
    "host": `cloud.mongodb.com`, 
    "path": `api/atlas/v1.0/groups/${project}/clusters/${cluster}`, 
    "username": username, 
    "password": password,
    "digestAuth": true,
    "headers": { "Content-Type": ["application/json"], "Accept-Encoding": ["bzip, deflate"] }, 
    "body": JSON.stringify(body)
  };
  
  return context.http.patch(args)
    .then(response => {
      const body = JSON.parse(response.body.text());
      if (response.statusCode != 200) throw body.detail;
      return { "cluster": cluster, "response": JSON.parse(response.body.text()) };
    });
};
