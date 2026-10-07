import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Communication App API')
    .setDescription(
      `A platform to practice English`,
    )
    .setVersion('1.0.0')
    .addServer(`http://localhost:${process.env.PORT || 5000}`, 'Development Server')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',              // ✅ uncommented
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API Key for server-to-server authentication',
      },
      'API-Key',
    )
    .addTag('Authentication', 'User authentication and authorization')
    .addTag('Users', 'User management and profiles')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  document.info.version = process.env.npm_package_version || '1.0.0';

 SwaggerModule.setup('api/docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
  },
  // ✅ Inject JS that patches fetch to always include Authorization on multipart
  customJsStr: `
    (function() {
      const origFetch = window.fetch;
      window.fetch = function(url, options) {
        options = options || {};
        if (options.body instanceof FormData) {
          const auth = localStorage.getItem('authorized');
          if (auth) {
            try {
              const parsed = JSON.parse(auth);
              const token = parsed && parsed['JWT-auth'] && parsed['JWT-auth'].value;
              if (token) {
                options.headers = Object.assign({}, options.headers, {
                  'Authorization': 'Bearer ' + token
                });
              }
            } catch(e) {}
          }
        }
        return origFetch.call(this, url, options);
      };
    })();
  `,
  customSiteTitle: 'Communication App API Documentation',
  customfavIcon: '/favicon.ico',
  customJs: [
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
  ],
  customCssUrl: [
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
  ],
});

  console.log('📚 API Documentation available at:');
  console.log(`   - Swagger UI: http://localhost:${process.env.PORT || 3000}/api/docs`);
  console.log(`   - OpenAPI JSON: http://localhost:${process.env.PORT || 3000}/api/docs-json`);
}