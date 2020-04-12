exports = async function(){
  const body = { "paused": false };
  const result = await context.functions.execute('modifyClusters', body);
  console.log(`unpause: ${result}`)
  return `unpause complete!`;
};
