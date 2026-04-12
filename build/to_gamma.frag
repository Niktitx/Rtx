#version 130
uniform sampler2D u_texture;
uniform vec2 u_resolution;
out vec4 FragColor;

void main()
{
  vec2 texelSize = 1.0 / vec2(textureSize(u_texture, 0));

  vec2 uv = gl_FragCoord.xy / u_resolution;

  vec3 centerColor = texture(u_texture, uv).rgb;

  vec3 colorSum = vec3(0.0);
  float weightSum = 0.0;

  float colorThreshold = 0.1; //

  for (int x = -2; x <= 2; x++)
  {
    for (int y = -2; y <= 2; y++)
    {
      vec2 offset = vec2(x, y) * texelSize;
      vec3 neighborColor = texture(u_texture, uv + offset).rgb;

      float colorDiff = length(neighborColor - centerColor);

      if (colorDiff < colorThreshold)
      {
        float weight = 1.0 - (colorDiff / colorThreshold);

        colorSum += neighborColor * weight;
        weightSum += weight;
      }
    }
  }

  vec3 finalColor = weightSum > 0.0 ? (colorSum / weightSum) : centerColor;

  finalColor = max(finalColor, vec3(0.0));
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  FragColor = vec4(finalColor, 1.0);
}
