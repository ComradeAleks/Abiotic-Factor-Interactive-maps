const TemplateUtils = {
  // Replaces template placeholders with actual data values
  fillTemplate(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = data[key];
      return value !== undefined && value !== null ? value : '';
    });
  },


  // Loads multiple template files from URLs and returns them as an object
  async loadTemplates(templateUrls) {
    const responses = await Promise.all(Object.values(templateUrls).map(url => fetch(url)));
    const templateTexts = await Promise.all(responses.map(r => r.text()));
    
    const templates = {};
    const urlKeys = Object.keys(templateUrls);
    
    templateTexts.forEach((text, index) => {
      const key = urlKeys[index];
      templates[key] = text;
    });
    
    return templates;
  },

  // Parses HTML text and extracts main content and template elements
  parseHTMLTemplate(htmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    
    return {
      main: doc.querySelector('body').innerHTML.split('<template')[0],
      templates: Array.from(doc.querySelectorAll('template')).reduce((acc, template) => {
        acc[template.id] = template;
        return acc;
      }, {})
    };
  },


  // Gets template content from the DOM by template ID
  getTemplate(templateId) {
    const templateElement = document.getElementById(templateId);
    if (templateElement) {
      return templateElement.innerHTML;
    }
    return null;
  }
};

window.TemplateUtils = TemplateUtils;
