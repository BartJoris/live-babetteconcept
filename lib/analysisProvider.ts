export interface AnalysisResult {
  count: number;
  confidence: string;
  details?: string;
}

export async function analyzeImageOpenAI(imageBase64: string): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is niet geconfigureerd');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Je bent een beeldanalyse-systeem voor een kledingwinkel. Je taak is om het exacte aantal zichtbare personen (klanten en personeel) in het camerabeeld te tellen. Antwoord ALLEEN met een geldig JSON-object in dit formaat: {"count": <nummer>, "confidence": "high"|"medium"|"low", "details": "<korte beschrijving>"}. Tel geen mannequins, posters of reflecties.`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Tel het aantal personen in dit beveiligingscamerabeeld van een kledingwinkel.',
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`,
                detail: 'low',
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API fout: ${response.status} ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Geen antwoord van OpenAI');
  }

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Geen JSON gevonden in antwoord');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      confidence: parsed.confidence || 'low',
      details: parsed.details,
    };
  } catch {
    console.error('Kon OpenAI antwoord niet parsen:', content);
    const numberMatch = content.match(/\d+/);
    return {
      count: numberMatch ? parseInt(numberMatch[0], 10) : 0,
      confidence: 'low',
      details: 'Antwoord kon niet als JSON geparsed worden',
    };
  }
}

export async function analyzeImageYolo(imageBase64: string): Promise<AnalysisResult> {
  const serviceUrl = process.env.YOLO_SERVICE_URL;
  if (!serviceUrl) {
    throw new Error('YOLO_SERVICE_URL is niet geconfigureerd');
  }

  const response = await fetch(serviceUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });

  if (!response.ok) {
    throw new Error(`YOLO service fout: ${response.status}`);
  }

  const data = await response.json();
  return {
    count: data.count ?? 0,
    confidence: data.confidence ?? 'high',
    details: data.details,
  };
}

export async function analyzeImage(imageBase64: string, provider: 'openai' | 'yolo'): Promise<AnalysisResult> {
  if (provider === 'yolo') {
    return analyzeImageYolo(imageBase64);
  }
  return analyzeImageOpenAI(imageBase64);
}
