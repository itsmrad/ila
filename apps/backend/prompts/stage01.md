# ILA backend

We are building 'ILA' (tentative name), a Next-Generation AI-powered Browser Automation and Productivity Assistant, designed as a highly complex and deeply integrated Chrome extension. The final vision is an extension that can control any web application (e.g., Google Sheets, GitHub, Jira) using natural language, with full automation capabilities and cross-application workflows. ILA will feature a persistent memory system (BYOK or subscription-based), allowing it to learn and reduce token costs over time. The ultimate competitor is tools like Dex, but ILA aims to be faster, more seamless, and more personalized.



## in this repo we are building the backend for the extension

i have initialized better auth, drizzle auth, postgres url  
  
you have to create a production ready file and folder structure and add better auth and configure it for this extension also add a health route that shows server status, database status and in future it will show all services status, add all the routes for now, i want to get it setup, it should be a real life robust production api.

for login in better auth, users will click on the login link (on the extension ui ) which will redirect to the frontend of the website page (this will be implemented later) for now just use a html on the backend for name, username, email, password and sign in with google auth with better auth for testing now. so user click on extension login page -&gt; html page where user will fill the details or google login -&gt; extension redirect.  
  
setup this express server with production grade quality and make sure every single route is zod typesafe.  
  
also initialize a frontend app in this turborepo.
