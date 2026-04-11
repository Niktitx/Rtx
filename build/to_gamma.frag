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

  // Настройки денойзера
  float colorThreshold = 0.1; // То самое "N" - максимальная разница цветов
  //

  // Проходим по сетке 3x3 пикселя (можно 5x5 для более сильного эффекта)
  for (int x = -2; x <= 2; x++)
  {
    for (int y = -2; y <= 2; y++)
    {
      vec2 offset = vec2(x, y) * texelSize;
      vec3 neighborColor = texture(u_texture, uv + offset).rgb;

      // Насколько цвет соседа отличается от центрального?
      float colorDiff = length(neighborColor - centerColor);

      // Твоя логика: если разница меньше N, берем пиксель
      if (colorDiff < colorThreshold)
      {
        // Чем ближе цвет, тем больше его вес (плавное смешивание выглядит лучше резкого if)
        float weight = 1.0 - (colorDiff / colorThreshold);

        colorSum += neighborColor * weight;
        weightSum += weight;
      }
    }
  }

  // Вычисляем итоговый цвет (защита от деления на 0 на всякий случай)
  vec3 finalColor = weightSum > 0.0 ? (colorSum / weightSum) : centerColor;

  // Применяем гамма-коррекцию к уже сглаженному цвету
  finalColor = max(finalColor, vec3(0.0));
  finalColor = pow(finalColor, vec3(1.0 / 2.2));

  FragColor = vec4(finalColor, 1.0);
}
