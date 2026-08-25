export default {
  callId: 'call-id',
  toolsContext: {},
  stepNumber: 0,
  model: {
    provider: 'anthropic.messages',
    modelId: 'claude-haiku-4-5'
  },
  runtimeContext: {},
  finishReason: 'stop',
  rawFinishReason: 'end_turn',
  usage: {
    inputTokens: 1113,
    inputTokenDetails: {
      noCacheTokens: 1113,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 1047,
    outputTokenDetails: {},
    totalTokens: 2160
  },
  totalUsage: {
    inputTokens: 1113,
    inputTokenDetails: {
      noCacheTokens: 1113,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens: 1047,
    outputTokenDetails: {},
    totalTokens: 2160
  },
  content: [
    {
      type: 'text',
      text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
    }
  ],
  text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.',
  reasoning: [],
  files: [],
  sources: [],
  toolCalls: [],
  staticToolCalls: [],
  dynamicToolCalls: [],
  toolResults: [],
  staticToolResults: [],
  dynamicToolResults: [],
  responseMessages: [
    {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
        }
      ]
    }
  ],
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
      'cache-control': 'no-cache',
      'cf-cache-status': 'DYNAMIC',
      'cf-ray': 'cf-id',
      connection: 'keep-alive',
      'content-encoding': 'gzip',
      'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
      'content-type': 'text/event-stream; charset=utf-8',
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
            text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
          }
        ]
      }
    ]
  },
  providerMetadata: {
    anthropic: {
      usage: {
        input_tokens: 1113,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0
        },
        output_tokens: 1047,
        service_tier: 'standard',
        inference_geo: 'not_available'
      },
      stopSequence: null,
      iterations: null,
      container: null,
      contextManagement: null
    }
  },
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
          text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
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
        outputTokens: 1047,
        outputTokenDetails: {},
        totalTokens: 2160,
        raw: {
          input_tokens: 1113,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
            ephemeral_1h_input_tokens: 0
          },
          output_tokens: 1047,
          service_tier: 'standard',
          inference_geo: 'not_available'
        }
      },
      performance: {
        stepTimeMs: 13832.783131,
        toolExecutionMs: {},
        responseTimeMs: 13825.09859,
        effectiveOutputTokensPerSecond: 75.73182883175375,
        outputTokensPerSecond: 80.47141153273097,
        inputTokensPerSecond: 1366.873868534236,
        effectiveTotalTokensPerSecond: 156.2375838362828,
        timeToFirstOutputMs: 814.2667919999985,
        timeBetweenOutputChunksMs: {
          min: 14.693207999996957,
          p10: 218.4890000000014,
          median: 308.51570800000263,
          avg: 309.5432303095238,
          p90: 409.6527079999996,
          max: 424.6636670000007
        }
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
          'cache-control': 'no-cache',
          'cf-cache-status': 'DYNAMIC',
          'cf-ray': 'cf-id',
          connection: 'keep-alive',
          'content-encoding': 'gzip',
          'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
          'content-type': 'text/event-stream; charset=utf-8',
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
                text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
              }
            ]
          }
        ]
      },
      providerMetadata: {
        anthropic: {
          usage: {
            input_tokens: 1113,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_5m_input_tokens: 0,
              ephemeral_1h_input_tokens: 0
            },
            output_tokens: 1047,
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
        text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
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
      outputTokens: 1047,
      outputTokenDetails: {},
      totalTokens: 2160,
      raw: {
        input_tokens: 1113,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation: {
          ephemeral_5m_input_tokens: 0,
          ephemeral_1h_input_tokens: 0
        },
        output_tokens: 1047,
        service_tier: 'standard',
        inference_geo: 'not_available'
      }
    },
    performance: {
      stepTimeMs: 13832.783131,
      toolExecutionMs: {},
      responseTimeMs: 13825.09859,
      effectiveOutputTokensPerSecond: 75.73182883175375,
      outputTokensPerSecond: 80.47141153273097,
      inputTokensPerSecond: 1366.873868534236,
      effectiveTotalTokensPerSecond: 156.2375838362828,
      timeToFirstOutputMs: 814.2667919999985,
      timeBetweenOutputChunksMs: {
        min: 14.693207999996957,
        p10: 218.4890000000014,
        median: 308.51570800000263,
        avg: 309.5432303095238,
        p90: 409.6527079999996,
        max: 424.6636670000007
      }
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
        'cache-control': 'no-cache',
        'cf-cache-status': 'DYNAMIC',
        'cf-ray': 'cf-id',
        connection: 'keep-alive',
        'content-encoding': 'gzip',
        'content-security-policy': 'default-src \'none\'; frame-ancestors \'none\'',
        'content-type': 'text/event-stream; charset=utf-8',
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
              text: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
            }
          ]
        }
      ]
    },
    providerMetadata: {
      anthropic: {
        usage: {
          input_tokens: 1113,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          cache_creation: {
            ephemeral_5m_input_tokens: 0,
            ephemeral_1h_input_tokens: 0
          },
          output_tokens: 1047,
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
  output: '# What Carburetors Do\n\nA carburetor is a device that mixes gasoline and air in the right proportion and sprays that mixture into an engine\'s cylinders so they can burn and create power. For most of the 20th century, every car relied on one; today they are mostly obsolete, replaced by fuel injection systems, but you will still find them on lawnmowers, chainsaws, motorcycles, and older vehicles.\n\n## The Core Idea\n\nHere is the simplest mental model: a carburetor is like a tiny perfume atomizer. When you squeeze the bulb on a perfume bottle, air rushes past a tube that dips into liquid, and the rushing air pulls the liquid up and sprays it into a fine mist. A carburetor works the same way—the engine\'s intake creates a rush of air, and that moving air pulls gasoline from a small fuel tank (called a float bowl) and mixes it with the air before the whole mixture enters the cylinders.\n\nThis model is incomplete but correct. The real carburetor does more than a perfume atomizer, but the core principle—moving air pulling liquid into a stream—is the foundation.\n\n## How It Actually Works\n\nThe engine\'s intake stroke creates suction. As a piston moves down in a cylinder, it opens a valve and draws in air. That air has to pass through the carburetor first.\n\nInside the carburetor is a narrow passage called a **venturi**. As air flows through this bottleneck, it speeds up and pressure drops (this is a principle of fluid dynamics called Bernoulli\'s effect). At the point of lowest pressure, a small tube opens into the passage—the fuel line. The pressure difference sucks gasoline up through that tube, and the fast-moving air atomizes it into a fine mist. The mist and air then travel together into the cylinder.\n\nThe carburetor also has a **float bowl**, a small reservoir of gasoline. As fuel is drawn out, the level drops, which lowers a cork or plastic float. The float is attached to a needle valve; as it sinks, the needle opens and allows more fuel to flow in from the main tank. When the level rises again, the float rises and closes the valve. It is a self-regulating system, much like the fill mechanism in a toilet tank.\n\n## A Concrete Example\n\nImagine you are tuning a carburetor on a small engine. You notice the engine runs rough when cold. The problem is that cold air is denser, and cold gasoline is thicker, so the usual mixture is now too lean (too much air, not enough fuel). A carburetor has a **choke**—a flap that partially blocks the air intake. When you close the choke, you reduce the airflow, which lowers the pressure drop in the venturi, so less air is drawn in relative to fuel. The mixture becomes richer (more fuel, less air), which ignites more readily in a cold engine. Once the engine warms up, you gradually open the choke again and the mixture returns to normal.\n\nThis is why older cars had a manual choke lever or knob you had to adjust when starting in winter. Modern fuel-injected engines do this automatically with a computer.\n\n## Why Carburetors Are Gone\n\nCarburetors worked adequately for decades, but they have real limits. They struggle to maintain the correct fuel-to-air ratio across a wide range of engine speeds and loads. They are sensitive to altitude (air density changes), temperature, and fuel quality. They are also inefficient—a carburetor cannot respond as quickly as an engine\'s demands change.\n\nFuel injection systems use an electric pump, a computer, and precision injectors that spray fuel directly into each cylinder at the exact moment needed. A computer adjusts the mixture in real time based on dozens of sensors. The result is better fuel economy, cleaner emissions, easier cold starts, and more power.\n\n## Where You\'ll See Them Now\n\nCarburetors persist on small engines because they are cheap, reliable, and do not require electricity or complex electronics. A lawnmower or chainsaw does not need to vary its mixture across highway speeds, so a simple carburetor is perfectly adequate. They are also easier to rebuild if they gum up from sitting unused over winter.\n\n## What Was Left Out\n\nThis explanation covers the basic operating principle but skips the details of how carburetors handle different engine conditions (idle jets, power circuits, accelerator pumps), the chemistry of how different fuel grades affect mixture quality, and the tuning adjustments (jets, needles, screws) that mechanics use to optimize performance. If you plan to rebuild or tune a carburetor, you will need to learn those specifics for your particular model.'
};
