exports = async function(){
  console.log(`Unpausing clusters`);
  const body = { "paused": false };
  const result = await context.functions.execute("modifyClusters", body);
  console.log(`unpause: ${result}`)
  return `unpause complete!`;
};
