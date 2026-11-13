import { BaseAttribute } from '#trace_attribute';

export class LLMRequestDetails {
  ids;
  count;
  duration;

  constructor( ids, count, duration ) {
    this.ids = ids;
    this.count = count;
    this.duration = duration;
  }
}

export class LLMGeneration extends BaseAttribute {
  modelId;
  providerId;
  promptName;
  requestDetails;

  constructor( type, modelId, providerId, promptName, requestDetails ) {
    super( type );
    this.modelId = modelId;
    this.providerId = providerId;
    this.promptName = promptName;
    this.requestDetails = requestDetails;
  }
}
