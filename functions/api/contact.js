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

    if (response.ok) {
      // 成功時はサンクスページにリダイレクト
      return Response.redirect(new URL('/contact-thanks.html', request.url), 302);
    } else {
      // エラー詳細を返す
      const errorText = await response.text();
      return new Response(`Webhook error: ${response.status} - ${errorText}`, { status: 500 });
    }
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
