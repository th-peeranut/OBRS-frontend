import { isTrustedMapsUrl } from './trusted-maps-url';

describe('isTrustedMapsUrl (security review 2026-09, FE-5)', () => {
  describe('accepts', () => {
    it('Maps app share links', () => {
      expect(isTrustedMapsUrl('https://maps.app.goo.gl/AbC123')).toBeTrue();
      expect(isTrustedMapsUrl('https://goo.gl/maps/AbC123')).toBeTrue();
    });

    it('the classic maps host and google.<tld>/maps', () => {
      expect(isTrustedMapsUrl('https://maps.google.com/?q=13.7,100.5')).toBeTrue();
      expect(isTrustedMapsUrl('https://www.google.com/maps/place/Nong+Chak')).toBeTrue();
      expect(isTrustedMapsUrl('https://www.google.co.th/maps/search/?api=1&query=x')).toBeTrue();
      expect(isTrustedMapsUrl('https://google.com/maps/dir/?api=1')).toBeTrue();
    });

    it('host matching regardless of case', () => {
      expect(isTrustedMapsUrl('https://MAPS.APP.GOO.GL/x')).toBeTrue();
    });
  });

  describe('refuses', () => {
    it('any other https host, including look-alikes', () => {
      expect(isTrustedMapsUrl('https://evil.example/maps')).toBeFalse();
      expect(isTrustedMapsUrl('https://maps.app.goo.gl.evil.example/x')).toBeFalse();
      expect(isTrustedMapsUrl('https://google.com.evil.example/maps')).toBeFalse();
      expect(isTrustedMapsUrl('https://notgoogle.com/maps')).toBeFalse();
    });

    it('a bare goo.gl short link, which can resolve anywhere', () => {
      expect(isTrustedMapsUrl('https://goo.gl/AbC123')).toBeFalse();
      expect(isTrustedMapsUrl('https://goo.gl/mapsish/AbC123')).toBeFalse();
    });

    it('google.<tld> outside /maps', () => {
      expect(isTrustedMapsUrl('https://www.google.com/search?q=x')).toBeFalse();
      expect(isTrustedMapsUrl('https://accounts.google.com/maps')).toBeFalse();
    });

    it('non-https schemes and userinfo tricks', () => {
      expect(isTrustedMapsUrl('http://maps.app.goo.gl/x')).toBeFalse();
      expect(isTrustedMapsUrl('javascript:alert(1)')).toBeFalse();
      expect(isTrustedMapsUrl('https://maps.app.goo.gl@evil.example/')).toBeFalse();
    });

    it('a port on an allowed host', () => {
      expect(isTrustedMapsUrl('https://maps.app.goo.gl:8443/x')).toBeFalse();
    });

    it('relative, empty and nullish values', () => {
      expect(isTrustedMapsUrl('/maps')).toBeFalse();
      expect(isTrustedMapsUrl('')).toBeFalse();
      expect(isTrustedMapsUrl(null)).toBeFalse();
      expect(isTrustedMapsUrl(undefined)).toBeFalse();
    });
  });
});
