# Angular Project Setup

This guide provides a comprehensive walkthrough for setting up and running the Angular project, even if you do not have Node.js and Angular CLI installed on your machine.

## Prerequisites

Ensure you have the following tools installed before running the project:

1. **Node.js** (Version 16 or higher)
2. **Angular CLI**

If these are not installed, follow the steps below to set them up.

---

## Step 1: Install Node.js

1. Visit the [Node.js official website](https://nodejs.org).
2. Download and install the LTS version (recommended).
3. Follow the installation instructions for your operating system.

Once the installation is complete, verify the installation by opening a terminal or command prompt and running:

```bash
node -v
```

## Step 2: Install Angular CLI
After installing Node.js, you can install the Angular CLI globally using npm, the Node Package Manager. Run the following command in your terminal or command prompt:

```bash
npm install -g @angular/cli
```
To verify that Angular CLI has been installed successfully, run:

```bash
ng version
```
You should see information about the Angular CLI version.

## Step 3: Clone the Project Repository
If you have access to the project repository, you can clone it using Git. Run the following command, replacing <repository-url> with the actual URL of your project repository:

```bash
git clone <repository-url>
```
Once the repository is cloned, navigate to the project directory:

```bash
cd <project-directory>
```
Replace <project-directory> with the name of your project folder.

## Step 4: Install Project Dependencies
Once inside the project directory, you need to install the necessary dependencies listed in the package.json file. Run the following command:

```bash
npm install
```
This will install all the project dependencies locally in the node_modules folder.

## Step 5: Running the Angular Application
Now that the dependencies are installed, you can run the Angular project locally using the Angular CLI. Start the development server by running:

```bash
ng serve
```
By default, the application will be available at http://localhost:4200. Open a browser and navigate to this URL to view your application.

To serve the application on a different port, run:

```bash
ng serve --port <port-number>
```
Replace <port-number> with the desired port number.

## Step 6: Building the Application for Production
To build the project for production, use the following command:

```bash
ng build --prod
```
This will compile the project into a dist/ folder with all the assets and files needed for production deployment.

## Step 7: Troubleshooting
- Node.js Version Issues: If you encounter errors related to the Node.js version, make sure you are using a version that is compatible with Angular (Node.js v16.x.x or higher).
- Angular CLI Issues: If ng commands are not working, confirm that the Angular CLI is installed globally by running ng version.
- Dependency Issues: If errors occur during npm install, delete the node_modules folder and package-lock.json, then rerun npm install.

