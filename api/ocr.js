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
    '이 InBody 또는 아큐닉 체성분 검사지에서 다음 수치를 찾아서 JSON으로만 반환해줘. ' +
    '없으면 null. 숫자는 단위 없이 숫자만. 내장지방단계는 "피하형/균형형/경계/내장비만/고도내장비만" 중 하나.\n' +
    '{"체중kg":null,"골격근량kg":null,"체지방kg":null,"체지방률":null,"BMI":null,' +
    '"내장지방레벨":null,"내장지방단계":null,"복부둘레cm":null,"신장cm":null,"나이":null,' +
    '"기초대사량kcal":null,"권장체중kg":null,"체중조절kg":null,"근육조절kg":null,"지방조절kg":null,' +
    '"근육량_몸통kg":null,"근육량_몸통퍼센트":null,' +
    '"근육량_오른팔kg":null,"근육량_오른팔퍼센트":null,' +
    '"근육량_왼팔kg":null,"근육량_왼팔퍼센트":null,' +
    '"근육량_오른다리kg":null,"근육량_오른다리퍼센트":null,' +
    '"근육량_왼다리kg":null,"근육량_왼다리퍼센트":null,' +
    '"지방량_몸통kg":null,"지방량_몸통퍼센트":null,' +
    '"지방량_오른팔kg":null,"지방량_오른팔퍼센트":null,' +
    '"지방량_왼팔kg":null,"지방량_왼팔퍼센트":null,' +
    '"지방량_오른다리kg":null,"지방량_오른다리퍼센트":null,' +
    '"지방량_왼다리kg":null,"지방량_왼다리퍼센트":null}';

  let geminiRes;
  try {
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL || 'gemini-3.5-flash'}:generateContent?key=${apiKey}`,
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
