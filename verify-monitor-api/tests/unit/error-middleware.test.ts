import ErrorMiddleware from '../../src/middleware/error-middleware';

function invokeHandler(error: any): { statusCode: number; body: any } {
  let captured: any;
  const req: any = { path: '/api/incidents', method: 'POST', requestId: 'test', headers: {} };
  const res: any = {
    status(code: number) {
      this._code = code;
      return this;
    },
    json(body: any) {
      captured = { statusCode: this._code, body };
    },
  };
  (ErrorMiddleware as any).handleErrors()(error, req, res, () => {});
  return captured;
}

describe('ErrorMiddleware.handleErrors in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('masks errors that carry no statusCode', () => {
    const result = invokeHandler(new Error('Unknown affected services: idcheck-step1'));

    expect(result.statusCode).toBe(500);
    expect(result.body.message).toBe('An unexpected error occurred');
  });

  it('passes through message and status for errors that carry a statusCode', () => {
    const error = Object.assign(new Error('Unknown affected services: idcheck-step1'), {
      statusCode: 400,
    });

    const result = invokeHandler(error);

    expect(result.statusCode).toBe(400);
    expect(result.body.message).toBe('Unknown affected services: idcheck-step1');
  });

  it('does not leak internal error text when an untagged error is rethrown', () => {
    const internal = new Error(
      'Invalid `prisma.incident.create()` invocation: column "foo" does not exist'
    );

    const result = invokeHandler(internal);

    expect(result.statusCode).toBe(500);
    expect(result.body.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(result.body)).not.toContain('prisma');
  });
});
