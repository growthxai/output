const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAfUlEQVR4Xu3VQREAIAwEMWqnD/y7AyGblcDQy+zed8KNB/ADnIANCG+gEaQABShAAQpgMBwFKEABClAgjAAFKEABClCAAhgMRwEKUIACFAgjQAEKUIACFKAABsNRgAIUoAAFwghQgAIUoAAFKIDBcBSgAAUoQIEwAhTIK/ABN/RggaSa6FYAAAAASUVORK5CYII=';
const bytes = [
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64,
  8, 6, 0, 0, 0, 170, 105, 113, 222, 0, 0, 0, 125, 73, 68, 65, 84, 120, 94, 237, 213, 65, 17,
  0, 32, 12, 4, 49, 106, 167, 15, 252, 187, 3, 33, 155, 149, 192, 208, 203, 236, 222, 119, 194,
  141, 7, 240, 3, 156, 128, 13, 8, 111, 160, 17, 164, 0, 5, 40, 64, 1, 10, 96, 48, 28, 5, 40,
  64, 1, 10, 80, 32, 140, 0, 5, 40, 64, 1, 10, 80, 128, 2, 24, 12, 71, 1, 10, 80, 128, 2, 20,
  8, 35, 64, 1, 10, 80, 128, 2, 20, 160, 0, 6, 195, 81, 128, 2, 20, 160, 0, 5, 194, 8, 80,
  128, 2, 20, 160, 0, 5, 40, 128, 193, 112, 20, 160, 0, 5, 40, 64, 129, 48, 2, 20, 200, 43,
  240, 1, 55, 244, 96, 129, 164, 154, 232, 86, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130
];

export default {
  images: [
    {
      base64Data: base64,
      mediaType: 'image/png',
      // getters
      base64,
      uint8Array: new Uint8Array( bytes )
    }
  ],
  warnings: [
    {
      type: 'unsupported',
      feature: 'size',
      details: 'This model does not support the `size` option. Use `aspectRatio` instead.'
    }
  ],
  responses: [
    {
      timestamp: '2026-08-25T00:00:00.000Z',
      modelId: 'gemini-2.5-flash-image',
      headers: {
        'alt-svc': 'h3=":443"; ma=2592000,h3-29=":443"; ma=2592000',
        'content-encoding': 'gzip',
        'content-type': 'application/json; charset=UTF-8',
        date: 'Tue, 25 Aug 2026 00:00:00 GMT',
        server: 'scaffolding on HTTPServer2',
        'transfer-encoding': 'chunked',
        vary: 'Origin, X-Origin, Referer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'x-xss-protection': '0'
      }
    }
  ],
  providerMetadata: {
    googleVertex: {
      images: [
        {}
      ]
    },
    vertex: {
      images: [
        {}
      ]
    }
  },
  usage: {
    inputTokens: 157,
    outputTokens: 1290,
    totalTokens: 1447
  },
  image: {
    base64Data: base64,
    mediaType: 'image/png',
    // getters
    base64,
    uint8Array: new Uint8Array( bytes )
  }
};
