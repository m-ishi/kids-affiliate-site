export async function onRequestGet(context) {
  const { env } = context;

  const webhookUrl = env.WEBHOOK_URL;

  // テスト送信
  try {
    const testData = { test: true, timestamp: new Date().toISOString() };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData),
    });

    const responseText = await response.text();

    return new Response(JSON.stringify({
      webhookUrl: webhookUrl ? webhookUrl.substring(0, 40) + '...' : 'not set',
      testSent: true,
      responseStatus: response.status,
      responseOk: response.ok,
      responseText: responseText.substring(0, 200)
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      webhookUrl: webhookUrl ? webhookUrl.substring(0, 40) + '...' : 'not set',
      testSent: false,
      error: error.message
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
