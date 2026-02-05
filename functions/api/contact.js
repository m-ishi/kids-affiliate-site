export async function onRequestPost(context) {
  const { request, env } = context;

  const webhookUrl = env.WEBHOOK_URL;

  if (!webhookUrl) {
    return new Response('設定エラーが発生しました', { status: 500 });
  }

  try {
    const formData = await request.formData();
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      return Response.redirect(new URL('/contact-thanks.html', request.url), 302);
    } else {
      return new Response('送信に失敗しました。時間をおいて再度お試しください。', { status: 500 });
    }
  } catch (error) {
    return new Response('エラーが発生しました。時間をおいて再度お試しください。', { status: 500 });
  }
}
