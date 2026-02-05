export async function onRequestPost(context) {
  const { request, env } = context;

  // 環境変数からWebhook URLを取得
  const webhookUrl = env.WEBHOOK_URL;

  if (!webhookUrl) {
    return new Response(JSON.stringify({ error: 'Webhook URL not configured' }), {
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
      return new Response('送信に失敗しました', { status: 500 });
    }
  } catch (error) {
    return new Response('エラーが発生しました', { status: 500 });
  }
}
