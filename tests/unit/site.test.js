import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { WHATSAPP_NUMBER } from '../../js/data/contact.js';
import { SITE, absoluteUrl, businessJsonLd, renderMeta } from '../../js/data/site.js';

const publicFile = path => new URL(`../../public/${path}`, import.meta.url);

/** Dimensões de um JPEG: percorre os marcadores até o SOF (0xFFC0–0xFFCF, exceto C4/C8/CC). */
function jpegSize(file) {
  const buf = readFileSync(file);
  assert.equal(buf.readUInt16BE(0), 0xffd8, 'assinatura JPEG');
  let offset = 2;
  while (offset < buf.length) {
    assert.equal(buf[offset], 0xff, 'marcador JPEG');
    const marker = buf[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  throw new Error('SOF não encontrado');
}

test('URLs absolutas a partir de um endereço único', () => {
  assert.ok(SITE.url.endsWith('/'), 'a base precisa da barra final para o new URL() não comer o caminho');
  assert.equal(absoluteUrl(SITE.og.src), `${SITE.url}${SITE.og.src}`);
  assert.equal(absoluteUrl('#contato'), `${SITE.url}#contato`);
});

test('telefone derivado do número do WhatsApp (um lugar só)', () => {
  assert.equal(SITE.telefone, `+${WHATSAPP_NUMBER}`);
  assert.equal(SITE.telefoneVisivel.replace(/\D/g, ''), WHATSAPP_NUMBER.slice(2));
});

test('imagem de compartilhamento existe, é JPEG e bate com as dimensões declaradas', () => {
  const file = publicFile(SITE.og.src);
  assert.ok(existsSync(file), `${SITE.og.src} — gere com "npm run og:image"`);
  assert.deepEqual(jpegSize(file), { width: SITE.og.width, height: SITE.og.height });
  // WhatsApp e Facebook recortam em 1,91:1; fora disso o texto do card é cortado.
  assert.ok(Math.abs(SITE.og.width / SITE.og.height - 1.91) < 0.02, 'proporção do card');
  assert.equal(SITE.og.type, 'image/jpeg', 'WebP ainda não é lido por todos os leitores de link');
});

test('metas do <head>: canônica, Open Graph e Twitter com URL absoluta', () => {
  const html = renderMeta();
  const og = absoluteUrl(SITE.og.src);

  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITE.url}">`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${og.replace(/[.?*+^$[\]\\(){}|-]/g, '\\$&')}">`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<meta property="og:image:width" content="1200">/);

  // Nenhuma URL de compartilhamento pode ser relativa: os leitores de link não resolvem.
  for (const [, value] of html.matchAll(/(?:og:image|og:url|twitter:image)" content="([^"]+)"/g)) {
    assert.ok(value.startsWith('https://'), value);
  }
});

test('dados estruturados válidos e com os campos que o Google usa no painel local', () => {
  const html = renderMeta();
  const json = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s)[1];
  const data = JSON.parse(json);

  assert.deepEqual(data, businessJsonLd());
  assert.equal(data['@type'], 'LocalBusiness');
  assert.equal(data.url, SITE.url);
  assert.equal(data.image, absoluteUrl(SITE.og.src));
  assert.equal(data.telephone, `+${WHATSAPP_NUMBER}`);
  assert.equal(data.address.addressLocality, 'Cafelândia');

  // Campos omitidos de propósito: horário/coordenada errados são piores que ausentes (ver site.js).
  for (const campo of ['openingHoursSpecification', 'geo', 'priceRange']) {
    assert.ok(!(campo in data), `${campo} só deve entrar com o dado confirmado`);
  }
});

test('conteúdo das metas é escapado (aspas e < > não podem quebrar o atributo)', () => {
  const html = renderMeta();
  const conteudos = [...html.matchAll(/content="([^"]*)"/g)].map(m => m[1]);
  assert.ok(conteudos.length > 8);
  for (const valor of conteudos) assert.ok(!/[<>]/.test(valor), valor);
});
