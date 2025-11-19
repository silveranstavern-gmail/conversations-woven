export interface ModelCardData {
  description: string;
  pricing: {
    prompt: number;
    completion: number;
    request: number;
    image: number;
  };
  contextLength: number;
  architecture: {
    modality: string;
    input_modalities: string[];
    output_modalities: string[];
  };
}

