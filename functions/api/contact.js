export async function onRequestPost(context) {
  const { request, env } = context;

  // 環境変数からWebhook URLを取得
  const webhookUrl = env.WEBHOOK_URL;

  if (!webhookUrl) {
    return new Response(JSON.stringify({ error: 'WEBHOOK_URL not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // フォームデータを取得
    const formData = await request.formData();
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    // n8n webhookに転送
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    const responseText = await response.text();

    // デバッグ: 結果を表示（後で削除）
    return new Response(JSON.stringify({
      formData: data,
      webhookStatus: response.status,
      webhookOk: response.ok,
      webhookResponse: responseText.substring(0, 200)
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
