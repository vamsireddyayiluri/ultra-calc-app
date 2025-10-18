module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0f62fe',
        secondary: '#2364aa',
        accent: '#5bc1c1',
      },
      borderRadius: {
        lg: '12px',
      },
      spacing: {
        18: '4.5rem'
      }
    }
  }
}
