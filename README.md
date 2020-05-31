# Atlas Billing & Automation

This project enables you to build your own automated MongoDB Atlas Billing Dashboard. It provides the code referenced in my MongoDB.live 2020 talk ("Tracking and Managing Your Spend on MongoDB Atlas"), including the extended functions referenced towards the end of the presentation.

# Overview

The code in this repo contains several functions, values & secrets and triggers as follow.

## Functions:

- `getdata`: a simple function to retrieve the pending invoice for a single Org.
- `getdata2`: a more complex set of functions to retrieve the pending invoice for the given Org, unwinding the output data into a new collection.
- `getdata3`: an evolution of the above code to map org & project names as well as reshape the output documents
- `getdata4`: a more complex function which retrieves all invoice data (pending and historic), applies any new data and has additional categorization of the data to enhance the output in MongoDB Charts.

- `modifyClusters`: a generic function to modify a set of clusters (referenced by the `auto-clusters` Value).
- `pause`: a function with leverages the `modifyClusters` function to pause the referenced clusters.
- `unpause`: a function with leverages the `modifyClusters` function to unpause (resume) the referenced clusters.

## Values & Secrets

- `billing-org`: maps to the Org Id we want to gather Billing data from. Maps to `billing-orgSecret`.
- `billing-username`: maps to the Public API key for the Org we want to gather Billing data from. Maps to `billing-usernameSecret`.
- `billing-password`: maps to the Private API key for the Org we want to gather Billing data from. Maps to `billing-passwordSecret`.

- `auto-project`: maps to the Project Id of the Project where we want to control clusters. Maps to `auto-projectSecret`.
- `auto-username`: maps to the Public API key for the Project where we want to control clusters. Maps to `auto-usernameSecret`.
- `auto-password`: maps to the Private API key for the Project where we want to control clusters. Maps to `auto-passwordSecret`.
- `auto-clusters`: an array of cluster names we want to modify via the 'pause' and 'unpause' functions define above.

## Triggers

- `getdataTrigger`: runs at 4am GMT each morning to retrieve the billing data using the `getdata4` function above.
- `pauseTrigger`: runs at 8pm GMT MON-FRI to pause the clusters listed in the `auto-clusters` Value above.
- `unpauseTrigger`: runs at 8am GMT MON-FRI to unpause (resume) the clusters listed in the `auto-clusters` Value above.

# Pre-requisites

You will need the following before you can use this code:

- A MongoDB Atlas cluster (an M0 cluster will do). This will be used to store the billing data we gather. (To minimize network data transfer create this M0 cluster on AWS, in the 'us-east-1', 'us-west-2', 'eu-east-1' or 'ap-southeast-2' regions).
- A local clone of this repo so you can import it into your MongoDB Stitch application.

# Setup

To deploy the code in this repo you'll need several API Keys.

The main API key will be used to retrieve the Billing data from the target Organization.

The second key can be used to enable Automation for specific clusters in your Orgs/Projects (allowing you to pause/unpause the clusters on a schedule). Note you can use a single Org-level key for both functions if you with you automation clusters in the same Org you wish you retrieve the billing data for.

An additional key will be required to import the code in this repo into your own Stitch application.

## Create an API key for the Billing function

You will need to create an API in the target organization (the one you want to gather Billing data for).

1. Navigate to the target org.
2. Click on the 'Access Manager' on the left navigation bar.
3. Select the 'API Keys' tab.
4. Create an API key by clicking the 'Create API Key' button on the top right of the page.
5. Note the Public Key details.
6. Give the API key a suitable description.
7. Add the following permissions to your key: `Organization Billing Admin` and `Organization Read Only`.
8. Click 'Next'.
9. Record the Private Key details and store them securely.
10. Add a Whitelist Entry for the API key if required.
11. Click 'Done' when you're ready to save the new key to your Organization.

## Record the Organization ID

Before moving on we will record the Organization ID:

1. Navigate to the 'Organzation Settings' by clicking the cog to the right of the organization name (on the top left of the window).
2. Select 'Settings' on the left navigation bar.
3. Select 'General Settings'.
4. Record the 'Organization ID'.

## Create an API key for the Automation function

The code in this repo also includes functions to pause/unpause clusters. This functionality requires a key with additional roles.

You can create an Organization level key in order to control all of the clusters in each project in that Org. To do so you can repeat the steps above and add the `Organization Owner` role for the Org in question. For our purposes we'll just create a Project level key which restricts the key to just that project rather than the whole Org.

1. Navigate to the Project you wish to enable for automation.
2. Click the 3 vertical dots to the right of the project name (on the top left of the window).
3. Select 'Access Manager' on the left navigation bar.
4. Select the 'API Keys' tab.
5. Create a new API Key with the `Project Cluster Manager` role, following the same steps as above (for the Billing API Key, step 4 onwards).

## Record the Project ID

Before moving on we will record the Project ID:

1. Navigate back to the 'Project Settings' if required by clicking the the 3 vertical dots to the right of the project name (on the top left of the window).
2. Select 'Settings' on the left navigation bar.
4. Record the 'Project ID' from the 'Project Settings' tab.

## Create an API key for the Stitch CLI

To import the code in this repo into your own Stitch app you will need an additional Project-level API key associated with the Project where your Billing cluster resides.

1. Navigate to the Project where you created the MongoDB cluster to store the Billing data.
2. Create a new API key following the steps above but with the `Project Owner` role.

## Download the Stitch CLI Client

Follow the instructions on [this page](https://docs.mongodb.com/stitch/deploy/stitch-cli-reference/) to download the Stitch CLI for your platform.

## Import the code into your Stitch App

1. [Log in via the Stitch CLI](https://docs.mongodb.com/stitch/deploy/stitch-cli-reference/#authenticate-a-cli-user) using the details of the key created above:
`stitch-cli login --api-key=my-api-key --private-api-key=my-private-api-key`
2. From the root of the local github clone run the following to create a new Stitch App:
`stitch-cli import`

Answer the questions e.g.:
- this app does not exist yet: would you like to create a new app? [y/n]: `y`
- App name: `billing`
- Available projects: \<select your Atlas cluster from above>
- Location [US-VA]: \<select the location where your Atlas cluster resides>
- Deployment Model [GLOBAL]: `LOCAL`

Note: this is expected to fail with an error message similar to the follow, as some Secrets have not yet been created:
`failed to import app: error: error validating Value: auto-password: could not find secret "auto-passwordSecret"`

## Create Secrets

While the previous command failed, it did create a new Stitch App. Navigate back to the Stitch App page (refresh if required) and select the new `billing` App.

With the Stitch App selected we can create the missing Secrets:

1. Switch to `Values & Secrets` on the left navigation bar
2. Click on the `Secrets` tab.
3. Create the following Secrets mapped to the values from above:
- `billing-orgSecret`: the ID of the Org we want to retrieve the Billing data for.
- `billing-usernameSecret`: the Public API key details for that Org.
- `billing-passwordSecret`: the Private API key details for that Org.
- `auto-projectSecret`: the ID of the Project we want to target when pausing/unpausing clusters.
- `auto-usernameSecret`: the Public API key details for that Project.
- `auto-passwordSecret`: the Private API key details for that Project.

## Redeploy the Stitch App

Now that we have our Secrets in place we can redeploy our App:
`stitch-cli import --strategy=replace`

Select '`y`' to confirm you want to repace the existing application.

## Connect to your Atlas cluster:

Now that the App has been redeployed, verify that the App is linked to your Atlas cluster:

1. Switch to 'Clusters' on the left navigation bar.
2. Ensure the 'Atlas Clusters' entry maps to your Atlas cluster from above.

If not, select the elipsis on the right for the 'mongodb-atlas' Service and select 'Edit Cluster Configuration'

1. Select your Atlas cluster in the 'Atlas Cluster' drop-down.
2. All other entries can be left as is.
3. Click 'Save' to save your choice.
4. Click the 'Review & Deploy Changes' option from the new blue bar at the top of the screen.
5. Verify the changes in the resulting dialog and click 'Deploy' to deploy and make live your changes.

## Verify everything is working

Now that we've deployed our code you can test it interactively.

1. Navigate to 'Functions' from the left navigation bar.
2. Select the 'getdata' function.
3. Click the 'Run' button at the bottom of the screen.

All going well, the function should complete successfully and populate the `billingdata` collection in the `billing` database of your Atlas cluster.

If anthing goes wrong, check the error message and make sure you have entered the values of the Secrets correctly (you can update them at any stage by navigating to `Values & Secrets` on the left navigation bar, choosing the `Secrets` tab and updating each entry as required).

# Next Steps

Now that the code is installed and validated you should review the following:

- Update the list of clusters in the `auto-clusters` Value to map to the clusters you want to pause/unpase on a schedule.
- Update the time for each Trigger such that it runs when you want.

Once the Triggers are set up correctly and data is populating on a daily basis you can switch to MonogDB Charts to visualize the data as per the MongoDB.live presentation.

# Enhancements

Additional enhancements are possible such as:

- Adding a Webhook to provide an endpoint allowing you to pause/unpase specific clusters on demand.
- Extend the Billing code to retrieve data from multiple MongoDB Atlas Orgs.
