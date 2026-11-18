export const req1 = {
  initialResponseMessages: [],
  steps: [
    {
      callId: 'call-id',
      stepNumber: 0,
      model: {
        provider: 'anthropic.messages',
        modelId: 'claude-haiku-4-5'
      },
      runtimeContext: {},
      toolsContext: {},
      content: [
        {
          type: 'text',
          text: 'seeded'
        }
      ],
      finishReason: 'stop',
      rawFinishReason: 'end_turn',
      usage: {
        inputTokens: 15016,
        inputTokenDetails: {
          noCacheTokens: 15,
          cacheReadTokens: 0,
          cacheWriteTokens: 15001
        },
        outputTokens: 5,
        outputTokenDetails: {},
        totalTokens: 15021,
        raw: {
          input_tokens: 15,
          output_tokens: 5,
          cache_creation_input_tokens: 15001,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 15001,
            ephemeral_1h_input_tokens: 0
          },
          service_tier: 'standard',
          inference_geo: 'not_available'
        }
      },
      performance: {
        effectiveOutputTokensPerSecond: 5.60052700959165,
        effectiveTotalTokensPerSecond: 16825.103242215235,
        stepTimeMs: 892.9739589999954,
        responseTimeMs: 892.7731249999924,
        toolExecutionMs: {}
      },
      warnings: [],
      request: {},
      response: {
        id: 'res-id',
        timestamp: '2026-08-25T00:00:00.000Z',
        modelId: 'claude-haiku-4-5-20251001',
        headers: {
          'anthropic-organization-id': 'org-id',
          'anthropic-ratelimit-input-tokens-limit': '999',
          'anthropic-ratelimit-input-tokens-remaining': '998',
          'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-output-tokens-limit': '999',
          'anthropic-ratelimit-output-tokens-remaining': '998',
          'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-requests-limit': '99',
          'anthropic-ratelimit-requests-remaining': '98',
          'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-tokens-limit': '999',
          'anthropic-ratelimit-tokens-remaining': '998',
          'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-workspace-id': 'workspace-id',
          'cf-cache-status': 'DYNAMIC',
          'cf-ray': 'cf-id',
          connection: 'keep-alive',
          'content-encoding': 'br',
          'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
          'content-type': 'application/json',
          date: 'Tue, 25 Aug 2026 00:00:00 GMT',
          'request-id': 'req-id',
          server: 'cloudflare',
          'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
          traceresponse: 'trace-id',
          'transfer-encoding': 'chunked',
          vary: 'Accept-Encoding',
          'x-robots-tag': 'none'
        },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'seeded'
              }
            ]
          }
        ]
      },
      providerMetadata: {
        anthropic: {
          usage: {
            input_tokens: 15,
            output_tokens: 5,
            cache_creation_input_tokens: 15001,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 15001,
              ephemeral_1h_input_tokens: 0
            },
            service_tier: 'standard',
            inference_geo: 'not_available'
          },
          stopSequence: null,
          iterations: null,
          container: null,
          contextManagement: null
        }
      }
    }
  ],
  _output: 'seeded',
  totalUsage: {
    inputTokens: 15016,
    inputTokenDetails: {
      noCacheTokens: 15,
      cacheReadTokens: 0,
      cacheWriteTokens: 15001
    },
    outputTokens: 5,
    outputTokenDetails: {},
    totalTokens: 15021
  },
  // getters
  finalStep: {
    callId: 'call-id',
    stepNumber: 0,
    model: {
      provider: 'anthropic.messages',
      modelId: 'claude-haiku-4-5'
    },
    runtimeContext: {},
    toolsContext: {},
    content: [
      {
        type: 'text',
        text: 'seeded'
      }
    ],
    finishReason: 'stop',
    rawFinishReason: 'end_turn',
    usage: {
      inputTokens: 15016,
      inputTokenDetails: {
        noCacheTokens: 15,
        cacheReadTokens: 0,
        cacheWriteTokens: 15001
      },
      outputTokens: 5,
      outputTokenDetails: {},
      totalTokens: 15021,
      raw: {
        input_tokens: 15,
        output_tokens: 5,
        cache_creation_input_tokens: 15001,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 15001,
          ephemeral_1h_input_tokens: 0
        },
        service_tier: 'standard',
        inference_geo: 'not_available'
      }
    },
    performance: {
      effectiveOutputTokensPerSecond: 5.60052700959165,
      effectiveTotalTokensPerSecond: 16825.103242215235,
      stepTimeMs: 892.9739589999954,
      responseTimeMs: 892.7731249999924,
      toolExecutionMs: {}
    },
    warnings: [],
    request: {},
    response: {
      id: 'res-id',
      timestamp: '2026-08-25T00:00:00.000Z',
      modelId: 'claude-haiku-4-5-20251001',
      headers: {
        'anthropic-organization-id': 'org-id',
        'anthropic-ratelimit-input-tokens-limit': '999',
        'anthropic-ratelimit-input-tokens-remaining': '998',
        'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-output-tokens-limit': '999',
        'anthropic-ratelimit-output-tokens-remaining': '998',
        'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-requests-limit': '99',
        'anthropic-ratelimit-requests-remaining': '98',
        'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-tokens-limit': '999',
        'anthropic-ratelimit-tokens-remaining': '998',
        'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-workspace-id': 'workspace-id',
        'cf-cache-status': 'DYNAMIC',
        'cf-ray': 'cf-id',
        connection: 'keep-alive',
        'content-encoding': 'br',
        'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
        'content-type': 'application/json',
        date: 'Tue, 25 Aug 2026 00:00:00 GMT',
        'request-id': 'req-id',
        server: 'cloudflare',
        'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
        traceresponse: 'trace-id',
        'transfer-encoding': 'chunked',
        vary: 'Accept-Encoding',
        'x-robots-tag': 'none'
      },
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'seeded'
            }
          ]
        }
      ]
    },
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 15,
          output_tokens: 5,
          cache_creation_input_tokens: 15001,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 15001,
            ephemeral_1h_input_tokens: 0
          },
          service_tier: 'standard',
          inference_geo: 'not_available'
        },
        stopSequence: null,
        iterations: null,
        container: null,
        contextManagement: null
      }
    }
  },
  content: [
    {
      type: 'text',
      text: 'seeded'
    }
  ],
  text: 'seeded',
  files: [],
  reasoning: [],
  toolCalls: [],
  staticToolCalls: [],
  dynamicToolCalls: [],
  toolResults: [],
  staticToolResults: [],
  dynamicToolResults: [],
  sources: [],
  finishReason: 'stop',
  rawFinishReason: 'end_turn',
  warnings: [],
  providerMetadata: {
    anthropic: {
      usage: {
        input_tokens: 15,
        output_tokens: 5,
        cache_creation_input_tokens: 15001,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 15001,
          ephemeral_1h_input_tokens: 0
        },
        service_tier: 'standard',
        inference_geo: 'not_available'
      },
      stopSequence: null,
      iterations: null,
      container: null,
      contextManagement: null
    }
  },
  response: {
    id: 'res-id',
    timestamp: '2026-08-25T00:00:00.000Z',
    modelId: 'claude-haiku-4-5-20251001',
    headers: {
      'anthropic-organization-id': 'org-id',
      'anthropic-ratelimit-input-tokens-limit': '999',
      'anthropic-ratelimit-input-tokens-remaining': '998',
      'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-output-tokens-limit': '999',
      'anthropic-ratelimit-output-tokens-remaining': '998',
      'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-requests-limit': '99',
      'anthropic-ratelimit-requests-remaining': '98',
      'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-tokens-limit': '999',
      'anthropic-ratelimit-tokens-remaining': '998',
      'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-workspace-id': 'workspace-id',
      'cf-cache-status': 'DYNAMIC',
      'cf-ray': 'cf-id',
      connection: 'keep-alive',
      'content-encoding': 'br',
      'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
      'content-type': 'application/json',
      date: 'Tue, 25 Aug 2026 00:00:00 GMT',
      'request-id': 'req-id',
      server: 'cloudflare',
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      traceresponse: 'trace-id',
      'transfer-encoding': 'chunked',
      vary: 'Accept-Encoding',
      'x-robots-tag': 'none'
    },
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'seeded'
          }
        ]
      }
    ]
  },
  responseMessages: [
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'seeded'
        }
      ]
    }
  ],
  request: {},
  usage: {
    inputTokens: 15016,
    inputTokenDetails: {
      noCacheTokens: 15,
      cacheReadTokens: 0,
      cacheWriteTokens: 15001
    },
    outputTokens: 5,
    outputTokenDetails: {},
    totalTokens: 15021
  },
  output: 'seeded'
};

export const req2 = {
  initialResponseMessages: [],
  steps: [
    {
      callId: 'call-id',
      stepNumber: 0,
      model: {
        provider: 'anthropic.messages',
        modelId: 'claude-haiku-4-5'
      },
      runtimeContext: {},
      toolsContext: {},
      content: [
        {
          type: 'text',
          text: 'captured'
        }
      ],
      finishReason: 'stop',
      rawFinishReason: 'end_turn',
      usage: {
        inputTokens: 19017,
        inputTokenDetails: {
          noCacheTokens: 14,
          cacheReadTokens: 15001,
          cacheWriteTokens: 4002
        },
        outputTokens: 4,
        outputTokenDetails: {},
        totalTokens: 19021,
        raw: {
          input_tokens: 14,
          output_tokens: 4,
          cache_creation_input_tokens: 4002,
          cache_read_input_tokens: 15001,
          cache_creation: {
            ephemeral_5m_input_tokens: 4002,
            ephemeral_1h_input_tokens: 0
          },
          service_tier: 'standard',
          inference_geo: 'not_available'
        }
      },
      performance: {
        effectiveOutputTokensPerSecond: 5.724641517187713,
        effectiveTotalTokensPerSecond: 27222.10157460687,
        stepTimeMs: 698.8922089999978,
        responseTimeMs: 698.7337090000074,
        toolExecutionMs: {}
      },
      warnings: [],
      request: {},
      response: {
        id: 'res-id',
        timestamp: '2026-08-25T00:00:00.000Z',
        modelId: 'claude-haiku-4-5-20251001',
        headers: {
          'anthropic-organization-id': 'org-id',
          'anthropic-ratelimit-input-tokens-limit': '999',
          'anthropic-ratelimit-input-tokens-remaining': '999',
          'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-output-tokens-limit': '999',
          'anthropic-ratelimit-output-tokens-remaining': '999',
          'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-requests-limit': '99',
          'anthropic-ratelimit-requests-remaining': '98',
          'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
          'anthropic-ratelimit-tokens-limit': '999',
          'anthropic-ratelimit-tokens-remaining': '999',
          'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
          'anthropic-workspace-id': 'workspace-id',
          'cf-cache-status': 'DYNAMIC',
          'cf-ray': 'cf-id',
          connection: 'keep-alive',
          'content-encoding': 'br',
          'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
          'content-type': 'application/json',
          date: 'Tue, 25 Aug 2026 00:00:00 GMT',
          'request-id': 'req-id',
          server: 'cloudflare',
          'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
          traceresponse: 'trace-id',
          'transfer-encoding': 'chunked',
          vary: 'Accept-Encoding',
          'x-robots-tag': 'none'
        },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'captured'
              }
            ]
          }
        ]
      },
      providerMetadata: {
        anthropic: {
          usage: {
            input_tokens: 14,
            output_tokens: 4,
            cache_creation_input_tokens: 4002,
            cache_read_input_tokens: 15001,
            cache_creation: {
              ephemeral_5m_input_tokens: 4002,
              ephemeral_1h_input_tokens: 0
            },
            service_tier: 'standard',
            inference_geo: 'not_available'
          },
          stopSequence: null,
          iterations: null,
          container: null,
          contextManagement: null
        }
      }
    }
  ],
  _output: 'captured',
  totalUsage: {
    inputTokens: 19017,
    inputTokenDetails: {
      noCacheTokens: 14,
      cacheReadTokens: 15001,
      cacheWriteTokens: 4002
    },
    outputTokens: 4,
    outputTokenDetails: {},
    totalTokens: 19021
  },
  // getters
  finalStep: {
    callId: 'call-id',
    stepNumber: 0,
    model: {
      provider: 'anthropic.messages',
      modelId: 'claude-haiku-4-5'
    },
    runtimeContext: {},
    toolsContext: {},
    content: [
      {
        type: 'text',
        text: 'captured'
      }
    ],
    finishReason: 'stop',
    rawFinishReason: 'end_turn',
    usage: {
      inputTokens: 19017,
      inputTokenDetails: {
        noCacheTokens: 14,
        cacheReadTokens: 15001,
        cacheWriteTokens: 4002
      },
      outputTokens: 4,
      outputTokenDetails: {},
      totalTokens: 19021,
      raw: {
        input_tokens: 14,
        output_tokens: 4,
        cache_creation_input_tokens: 4002,
        cache_read_input_tokens: 15001,
        cache_creation: {
          ephemeral_5m_input_tokens: 4002,
          ephemeral_1h_input_tokens: 0
        },
        service_tier: 'standard',
        inference_geo: 'not_available'
      }
    },
    performance: {
      effectiveOutputTokensPerSecond: 5.724641517187713,
      effectiveTotalTokensPerSecond: 27222.10157460687,
      stepTimeMs: 698.8922089999978,
      responseTimeMs: 698.7337090000074,
      toolExecutionMs: {}
    },
    warnings: [],
    request: {},
    response: {
      id: 'res-id',
      timestamp: '2026-08-25T00:00:00.000Z',
      modelId: 'claude-haiku-4-5-20251001',
      headers: {
        'anthropic-organization-id': 'org-id',
        'anthropic-ratelimit-input-tokens-limit': '999',
        'anthropic-ratelimit-input-tokens-remaining': '999',
        'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-output-tokens-limit': '999',
        'anthropic-ratelimit-output-tokens-remaining': '999',
        'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-requests-limit': '99',
        'anthropic-ratelimit-requests-remaining': '98',
        'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
        'anthropic-ratelimit-tokens-limit': '999',
        'anthropic-ratelimit-tokens-remaining': '999',
        'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
        'anthropic-workspace-id': 'workspace-id',
        'cf-cache-status': 'DYNAMIC',
        'cf-ray': 'cf-id',
        connection: 'keep-alive',
        'content-encoding': 'br',
        'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
        'content-type': 'application/json',
        date: 'Tue, 25 Aug 2026 00:00:00 GMT',
        'request-id': 'req-id',
        server: 'cloudflare',
        'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
        traceresponse: 'trace-id',
        'transfer-encoding': 'chunked',
        vary: 'Accept-Encoding',
        'x-robots-tag': 'none'
      },
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'captured'
            }
          ]
        }
      ]
    },
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 14,
          output_tokens: 4,
          cache_creation_input_tokens: 4002,
          cache_read_input_tokens: 15001,
          cache_creation: {
            ephemeral_5m_input_tokens: 4002,
            ephemeral_1h_input_tokens: 0
          },
          service_tier: 'standard',
          inference_geo: 'not_available'
        },
        stopSequence: null,
        iterations: null,
        container: null,
        contextManagement: null
      }
    }
  },
  content: [
    {
      type: 'text',
      text: 'captured'
    }
  ],
  text: 'captured',
  files: [],
  reasoning: [],
  toolCalls: [],
  staticToolCalls: [],
  dynamicToolCalls: [],
  toolResults: [],
  staticToolResults: [],
  dynamicToolResults: [],
  sources: [],
  finishReason: 'stop',
  rawFinishReason: 'end_turn',
  warnings: [],
  providerMetadata: {
    anthropic: {
      usage: {
        input_tokens: 14,
        output_tokens: 4,
        cache_creation_input_tokens: 4002,
        cache_read_input_tokens: 15001,
        cache_creation: {
          ephemeral_5m_input_tokens: 4002,
          ephemeral_1h_input_tokens: 0
        },
        service_tier: 'standard',
        inference_geo: 'not_available'
      },
      stopSequence: null,
      iterations: null,
      container: null,
      contextManagement: null
    }
  },
  response: {
    id: 'res-id',
    timestamp: '2026-08-25T00:00:00.000Z',
    modelId: 'claude-haiku-4-5-20251001',
    headers: {
      'anthropic-organization-id': 'org-id',
      'anthropic-ratelimit-input-tokens-limit': '999',
      'anthropic-ratelimit-input-tokens-remaining': '999',
      'anthropic-ratelimit-input-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-output-tokens-limit': '999',
      'anthropic-ratelimit-output-tokens-remaining': '999',
      'anthropic-ratelimit-output-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-requests-limit': '99',
      'anthropic-ratelimit-requests-remaining': '98',
      'anthropic-ratelimit-requests-reset': '2026-08-25T00:00:00Z',
      'anthropic-ratelimit-tokens-limit': '999',
      'anthropic-ratelimit-tokens-remaining': '999',
      'anthropic-ratelimit-tokens-reset': '2026-08-25T00:00:00Z',
      'anthropic-workspace-id': 'workspace-id',
      'cf-cache-status': 'DYNAMIC',
      'cf-ray': 'cf-id',
      connection: 'keep-alive',
      'content-encoding': 'br',
      'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
      'content-type': 'application/json',
      date: 'Tue, 25 Aug 2026 00:00:00 GMT',
      'request-id': 'req-id',
      server: 'cloudflare',
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      traceresponse: 'trace-id',
      'transfer-encoding': 'chunked',
      vary: 'Accept-Encoding',
      'x-robots-tag': 'none'
    },
    messages: [
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'captured'
          }
        ]
      }
    ]
  },
  responseMessages: [
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'captured'
        }
      ]
    }
  ],
  request: {},
  usage: {
    inputTokens: 19017,
    inputTokenDetails: {
      noCacheTokens: 14,
      cacheReadTokens: 15001,
      cacheWriteTokens: 4002
    },
    outputTokens: 4,
    outputTokenDetails: {},
    totalTokens: 19021
  },
  output: 'captured'
};
