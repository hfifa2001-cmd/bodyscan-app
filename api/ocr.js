export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { image, mimeType } = req.body || {};
  if (!image) return res.status(400).json({ error: '이미지 데이터가 없습니다.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });

  const prompt =
    '이 InBody 또는 아큐닉 체성분 검사지에서 다음 수치를 찾아서 JSON으로만 반환해줘. 없으면 null.\n' +
    '{"체중(kg)": null, "골격근량(kg)": null, "체지방(kg)": null, "체지방률(%)": null, ' +
    '"BMI": null, "내장지방레벨(숫자)": null, "복부둘레(cm)": null, "신장(cm)": null, "나이(세)": null}';

  let geminiRes;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/jpeg', data: image } },
            ],
          }],
        }),
      }
    );
  } catch (e) {
    console.error('[OCR] Gemini 네트워크 오류:', e);
    return res.status(502).json({ error: true, message: e.message, status: 502 });
  }

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error('[OCR] Gemini HTTP 오류', geminiRes.status, errText);
    return res.status(502).json({ error: true, message: 'Gemini API HTTP ' + geminiRes.status, status: geminiRes.status, detail: errText });
  }

  let geminiData;
  try {
    geminiData = await geminiRes.json();
  } catch (e) {
    console.error('[OCR] Gemini 응답 JSON 파싱 실패:', e);
    return res.status(502).json({ error: true, message: '응답 파싱 실패: ' + e.message, status: 502 });
  }

  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

  let parsed = null;
  try {
    const m = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/(\{[\s\S]*?\})/);
    if (m) parsed = JSON.parse(m[1]);
  } catch (e) {
    console.error('[OCR] JSON 파싱 실패:', e, '원문:', text);
  }

  return res.status(200).json({ data: parsed, raw: text });
}
