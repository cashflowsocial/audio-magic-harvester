
interface FreesoundSample {
  id: string;
  name: string;
  url: string;
}

export async function getGuitarSamples(supabase: any): Promise<Record<string, FreesoundSample>> {
  try {
    // Get Freesound credentials from Supabase
    const { data: { secret: clientId } } = await supabase
      .functions.invoke('get-secret', {
        body: { name: 'FREESOUND_CLIENT_ID' }
      });

    const { data: { secret: clientSecret } } = await supabase
      .functions.invoke('get-secret', {
        body: { name: 'FREESOUND_CLIENT_SECRET' }
      });

    // First get the access token
    const tokenResponse = await fetch('https://freesound.org/apiv2/oauth2/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      }),
    });

    const { access_token } = await tokenResponse.json();

    // Search for guitar samples
    const searchResponse = await fetch(
      'https://freesound.org/apiv2/search/text/' +
      '?query=guitar+single+note+electric&filter=duration:[0.1 TO 2.0]' +
      '&fields=id,name,previews&page_size=15',
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const searchData = await searchResponse.json();
    
    // Transform the results into our desired format
    const samples: Record<string, FreesoundSample> = {};
    
    searchData.results.forEach((result: any, index: number) => {
      samples[`note_${index + 1}`] = {
        id: result.id,
        name: result.name,
        url: result.previews['preview-hq-mp3'], // Use high quality preview
      };
    });

    console.log('Found guitar samples:', samples);
    return samples;

  } catch (error) {
    console.error('Error fetching guitar samples:', error);
    throw error;
  }
}
