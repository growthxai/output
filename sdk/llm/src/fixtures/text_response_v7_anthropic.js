export default {
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
          text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
        }
      ],
      finishReason: 'stop',
      rawFinishReason: 'end_turn',
      usage: {
        inputTokens: 1113,
        inputTokenDetails: {
          noCacheTokens: 1113,
          cacheReadTokens: 0,
          cacheWriteTokens: 0
        },
        outputTokens: 845,
        outputTokenDetails: {},
        totalTokens: 1958,
        raw: {
          input_tokens: 1113,
          output_tokens: 845,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
            ephemeral_1h_input_tokens: 0
          },
          service_tier: 'standard',
          inference_geo: 'not_available'
        }
      },
      performance: {
        effectiveOutputTokensPerSecond: 79.2188709573136,
        effectiveTotalTokensPerSecond: 183.56278027742016,
        stepTimeMs: 10666.972005,
        responseTimeMs: 10666.65038,
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
                text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
              }
            ]
          }
        ]
      },
      providerMetadata: {
        anthropic: {
          usage: {
            input_tokens: 1113,
            output_tokens: 845,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 0,
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
  _output: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.',
  totalUsage: {
    inputTokens: 1113,
    inputTokenDetails: {
      noCacheTokens: 1113,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 845,
    outputTokenDetails: {},
    totalTokens: 1958
  },
  // these are getters only
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
        text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
      }
    ],
    finishReason: 'stop',
    rawFinishReason: 'end_turn',
    usage: {
      inputTokens: 1113,
      inputTokenDetails: {
        noCacheTokens: 1113,
        cacheReadTokens: 0,
        cacheWriteTokens: 0
      },
      outputTokens: 845,
      outputTokenDetails: {},
      totalTokens: 1958,
      raw: {
        input_tokens: 1113,
        output_tokens: 845,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0
        },
        service_tier: 'standard',
        inference_geo: 'not_available'
      }
    },
    performance: {
      effectiveOutputTokensPerSecond: 79.2188709573136,
      effectiveTotalTokensPerSecond: 183.56278027742016,
      stepTimeMs: 10666.972005,
      responseTimeMs: 10666.65038,
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
              text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
            }
          ]
        }
      ]
    },
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 1113,
          output_tokens: 845,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
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
      text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
    }
  ],
  text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.',
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
        input_tokens: 1113,
        output_tokens: 845,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
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
            text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
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
          text: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
        }
      ]
    }
  ],
  request: {},
  usage: {
    inputTokens: 1113,
    inputTokenDetails: {
      noCacheTokens: 1113,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 845,
    outputTokenDetails: {},
    totalTokens: 1958
  },
  output: '# Carburetors\n\nA **carburetor** is a device that mixes gasoline and air in the right proportions and sprays the mixture into an engine\'s cylinders so it can burn and produce power. It solved a crucial problem in early engines: how to turn liquid fuel into a fine mist that ignites reliably.\n\n## The core idea\n\nImagine you need to light a puddle of gasoline on fire. It won\'t burn well—the fuel sits there too thick and dense. But if you spray that same gasoline as a fine mist into air, it ignites instantly and burns hot. A carburetor does exactly that: it atomizes liquid fuel and mixes it with air before it enters the engine.\n\nThe name itself hints at the job: it creates a *combustible* mixture, which is why it\'s called a carburetor (from "carburet," an old term meaning to combine with carbon).\n\n## How it works (the simple model)\n\nA carburetor relies on a surprising principle: **moving air has lower pressure than still air**. This is called the Bernoulli effect.\n\nHere\'s the sequence:\n\n1. The engine sucks air downward through a tube in the carburetor.\n2. As air moves fast through a narrow part of the tube, its pressure drops.\n3. A fuel reservoir sits just below this low-pressure zone, connected by a tiny tube.\n4. The pressure difference sucks fuel up and out into the moving airstream.\n5. The fuel breaks apart into tiny droplets as it mixes with the rushing air.\n6. This mist flows into the engine\'s cylinders, where a spark ignites it.\n\n## A concrete example\n\nThink of a perfume atomizer. When you squeeze the bulb, air rushes past a tube that dips into the perfume bottle. The moving air creates low pressure, which sucks perfume up and out as a fine spray. A carburetor works on the same principle, except the "air" is the engine\'s intake, the "perfume" is gasoline, and the "spray" goes into combustion rather than onto your wrist.\n\n## Why carburetors mattered—and why they\'re mostly gone\n\nFor decades, carburetors were the standard way to fuel engines. They were simple, cheap, and required no electricity to operate. A mechanical carburetor could work on motorcycles, lawnmowers, chainsaws, and cars.\n\nBut they have real limits. A carburetor cannot easily adjust to changing conditions—high altitude, cold weather, or hard acceleration. It also cannot fine-tune the fuel mixture precisely enough to meet modern emissions standards. As engines became more powerful and pollution regulations tightened, carburetors became a liability.\n\nBy the 1980s, **fuel injection** systems replaced carburetors in most cars. Fuel injectors are electronic nozzles that spray fuel directly into cylinders under computer control, adjusting the mixture thousands of times per second based on engine conditions. This is far more efficient and cleaner.\n\nYou\'ll still find carburetors on small engines (lawnmowers, older motorcycles, some chainsaws) because they\'re durable, inexpensive, and don\'t need a battery or computer. But in modern cars, they\'re nearly extinct.\n\n## What this explanation did not cover\n\nThis explanation focused on how a basic carburetor mixes fuel and air. Real carburetors are more complex: they have multiple circuits (one for idle, one for cruising, one for acceleration), a choke to help cold starts, and a float valve to maintain fuel level. If you want to understand those refinements, a manual for a specific carburetor model would be your next stop. For a deeper dive into fuel systems generally, you could compare carburetors to fuel injection to see how the engineering evolved.'
};
