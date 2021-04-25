// main worker function which modifies clusters according to the details in the 'payload' input parameter
exports = async function(project, username, password, clusters, payload)
{
  let promises = [];
  clusters.forEach(cluster => {
    // add a catch as we do not want the Promise to terminate early on error
    promises.push(modifyCluster(project, username, password, cluster, payload)
      .catch(err => { return err; }));
  });
  const results = await Promise.all(promises);
  return { "status": "complete!", "results": results };
};

modifyCluster = async function(project, username, password, cluster, payload) {
  const args = { 
    "scheme": `https`, 
    "host": `cloud.mongodb.com`, 
    "path": `api/atlas/v1.0/groups/${project}/clusters/${cluster}`, 
    "username": username, 
    "password": password,
    "digestAuth": true,
    "headers": { "Content-Type": ["application/json"] }, 
    "body": JSON.stringify(payload)
  };
  
  const response = await context.http.patch(args);
  const body = JSON.parse(response.body.text());
  return {"cluster": cluster, "response": body};
};
