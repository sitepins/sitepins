class ApiError extends Error {
  statusCode: number;
  constructor(message: string | undefined, statusCode: number, stack: "") {
    super(message);
    this.statusCode = statusCode;

    if (stack) {
      this.stack = stack;
    }
  }
}

export default ApiError;
