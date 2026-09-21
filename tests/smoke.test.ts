import request from 'supertest';
import { app } from '../src/app';

describe('API smoke test', () => {
  it('returns API gateway information from the root route', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      message: 'Classroom Reservation API Gateway',
      data: {
        service: 'classroom-reservation-api',
        status: 'online',
        endpoints: {
          health: '/health',
          documentation: '/docs',
          openApiDocumentation: '/api-docs',
          api: '/api',
        },
      },
    });
  });

  it('returns a healthy response', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
