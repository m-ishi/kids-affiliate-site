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
      data[key] = value.toString().trim();
    }

    // バリデーション: 必須フィールドのチェック
    const name = data.name || '';
    const email = data.email || '';
    const message = data.message || '';

    if (!name || !email || !message) {
      return new Response('必須項目を入力してください。', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // メールアドレスの簡易バリデーション
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response('有効なメールアドレスを入力してください。', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // スパム対策: 内容が短すぎる場合
    if (message.length < 10) {
      return new Response('お問い合わせ内容は10文字以上で入力してください。', {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
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
