exports = async function(){
  const body = { "paused": true };
  const result = await context.functions.execute('modifyClusters', body);
  console.log(`pause: ${result}`)
  return `pause complete!`;
};
