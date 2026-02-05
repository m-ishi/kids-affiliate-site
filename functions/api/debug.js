export async function onRequestGet(context) {
  const { env } = context;

  const webhookUrl = env.WEBHOOK_URL;

  return new Response(JSON.stringify({
    hasWebhookUrl: !!webhookUrl,
    webhookUrlLength: webhookUrl ? webhookUrl.length : 0,
    webhookUrlStart: webhookUrl ? webhookUrl.substring(0, 30) + '...' : 'not set'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
