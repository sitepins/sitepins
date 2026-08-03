type TErrorMessage = {
  path: string;
  message: string;
};

export class CustomApiError extends Error {
  statusCode: number;
  errorMessage: TErrorMessage[];
  tokenVerificationFailed: boolean;

  constructor(
    statusCode: number,
    message: string,
    errorMessage: TErrorMessage[] = [],
  ) {
    super(message);
    this.name = "CustomApiError";
    this.statusCode = statusCode;
    this.errorMessage = errorMessage;
    this.tokenVerificationFailed = false;
  }
}
