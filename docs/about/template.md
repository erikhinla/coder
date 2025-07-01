# Template

Coder templates are **Terraform-based configurations** that define the infrastructure and environment setup for developer workspaces. They serve as the blueprint for provisioning consistent, reproducible development environments across your organization.

![Templates in Coder Dashboard](../images/admin/templates/starter-templates.png)

## What are templates?

A Coder template is a [Terraform](https://terraform.io) configuration that uses the [Coder Terraform Provider](https://registry.terraform.io/providers/coder/coder/latest) to:

- **Provision infrastructure**: Define compute resources (VMs, containers, etc.) where workspaces run
- **Configure environments**: Set up development tools, IDEs, and workspace apps
- **Manage lifecycle**: Control how workspaces start, stop, and update
- **Enforce standards**: Ensure consistent development environments across teams

Templates are the foundation of Coder's **Infrastructure as Code** approach to developer environments.

## How templates work

When a developer creates a workspace, Coder:

1. **Applies the template**: Runs `terraform apply` using the template configuration
2. **Provisions infrastructure**: Creates the underlying compute resources (VM, container, etc.)
3. **Starts the agent**: Deploys the Coder agent to enable connections and apps
4. **Configures environment**: Runs startup scripts and initializes development tools

When a workspace is stopped or restarted, Coder manages the infrastructure lifecycle according to the template's resource persistence configuration.

## Template structure

### Core components

Every Coder template contains several key Terraform resources:

#### 1. **Coder Agent** (`coder_agent`)
The agent runs inside the workspace and enables SSH access, port forwarding, and IDE connections:

```tf
resource "coder_agent" "main" {
  os   = "linux"
  arch = "amd64"
  dir  = "/home/coder"
  startup_script = <<-EOT
    #!/bin/bash
    # Install development tools
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  EOT
}
```

#### 2. **Infrastructure Resources**
Standard Terraform resources that provision the underlying compute:

```tf
# Example: Docker container
resource "docker_container" "workspace" {
  count = data.coder_workspace.me.start_count
  image = "ubuntu:22.04"
  name  = "coder-${data.coder_workspace_owner.me.name}-${data.coder_workspace.me.name}"
  env   = ["CODER_AGENT_TOKEN=${coder_agent.main.token}"]
  command = ["sh", "-c", coder_agent.main.init_script]
}
```

#### 3. **Workspace Data Sources**
Provide information about the current workspace and user:

```tf
data "coder_workspace" "me" {}
data "coder_workspace_owner" "me" {}
data "coder_provisioner" "me" {}
```

#### 4. **Parameters** (`coder_parameter`)
Allow users to customize workspace creation:

```tf
data "coder_parameter" "instance_type" {
  name         = "instance_type"
  display_name = "Instance Type"
  description  = "Select the VM size for your workspace"
  default      = "t3.micro"
  option {
    name  = "Small (t3.micro)"
    value = "t3.micro"
  }
  option {
    name  = "Medium (t3.small)"
    value = "t3.small"
  }
}
```

#### 5. **Registry Modules**
Add development tools and functionality using community modules:

```tf
# VS Code via registry module (most common approach)
module "code-server" {
  source   = "registry.coder.com/modules/code-server/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
}

# JetBrains IDEs via registry module
module "jetbrains_gateway" {
  source   = "registry.coder.com/modules/jetbrains-gateway/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
}
```

Note: While templates *can* include `coder_app` and `coder_script` resources directly, it's more common to use registry modules that provide this functionality in a reusable way.

### File organization

A typical template directory contains:

```
my-template/
├── main.tf       # Main Terraform configuration
└── README.md     # Template documentation
```

Some templates may include additional files:

```
advanced-template/
├── main.tf              # Main Terraform configuration
├── README.md            # Template documentation
├── architecture.svg     # Architecture diagram (optional)
└── cloud-init/          # Cloud-init templates (optional)
    ├── cloud-config.yaml.tftpl
    └── userdata.sh.tftpl
```

## Template types

Coder provides templates for different deployment scenarios and organizational needs:

1. **Starter Templates** - Pre-built templates for common platforms:
   - [Docker](https://registry.coder.com/templates/docker): Containerized workspaces
   - [Kubernetes](https://registry.coder.com/templates/kubernetes): Pod-based workspaces
   - [AWS EC2](https://registry.coder.com/templates/aws-linux): Virtual machines on AWS
   - [Azure VMs](https://registry.coder.com/templates/azure-linux): Virtual machines on Azure
   - [GCP Compute](https://registry.coder.com/templates/gcp-linux): Virtual machines on Google Cloud

2. **Community Templates** - Templates shared by the Coder community for specialized use cases like specific frameworks, tools, or development stacks.

3. **Custom Templates** - Organization-specific templates tailored to your infrastructure, security requirements, and development workflows.

## Template registry integration

The [Coder Registry](https://registry.coder.com) provides reusable components to simplify template development:

1. **Templates** - Complete workspace configurations for various platforms
2. **Modules** - Reusable Terraform components that provide `coder_app`, `coder_script`, and other functionality

Templates leverage registry modules to add development tools and features:

```tf
# Add VS Code to any workspace
module "code-server" {
  source   = "registry.coder.com/modules/code-server/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
}

# Clone Git repositories
module "git-clone" {
  source   = "registry.coder.com/modules/git-clone/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
  url      = "https://github.com/myorg/myproject"
}

# Configure dotfiles
module "dotfiles" {
  source   = "registry.coder.com/modules/dotfiles/coder"
  version  = "~> 1.0"
  agent_id = coder_agent.main.id
  url      = "https://github.com/myuser/dotfiles"
}
```

## Template lifecycle

Templates follow a structured lifecycle from creation to workspace deployment:

1. **Creation and versioning**
   - Templates are created from Terraform configurations
   - Each template push creates a new version
   - Coder tracks version history and allows rollbacks

2. **Workspace provisioning**
   - Users create workspaces from templates
   - Parameters are collected during workspace creation
   - Infrastructure is provisioned via Terraform

3. **Updates and maintenance**
   - Template admins can push new versions
   - Users receive notifications about available updates
   - Updates can be applied manually or automatically

4. **Resource persistence**
   Templates define which resources persist across workspace restarts:
   - **Ephemeral**: Recreated on each start (compute instances)
   - **Persistent**: Preserved across restarts (home directories, databases)

## Advanced features

### **Workspace tags**
Control provisioner routing and resource placement:

```tf
data "coder_workspace_tags" "custom" {
  tags = {
    "region"  = data.coder_parameter.region.value
    "team"    = "developers"
    "project" = data.coder_parameter.project.value
  }
}
```

### **Metadata and monitoring**
Display resource information and metrics:

```tf
resource "coder_metadata" "info" {
  resource_id = coder_agent.main.id
  item {
    key   = "CPU Usage"
    value = "coder stat cpu"
    script = true
  }
}
```

### **Pre-built workspaces** (Premium)
Maintain pools of ready-to-use workspaces for faster provisioning:

```tf
resource "coder_workspace_preset" "production" {
  name = "production-env"
  parameters = {
    instance_type = "c5.xlarge"
    region       = "us-west-2"
  }
  prebuilds {
    count = 3
  }
}
```

## Template administration

### Permissions

Template access is controlled through role-based permissions:

1. **Template Admin** - Can create and modify templates
2. **Template User** - Can create workspaces from templates
3. **Organization roles** - Control template access across organizations

### Best practices

1. Start with starter templates and customize for your needs
2. Use version control for template source code
3. Implement CI/CD for template testing and deployment
4. Leverage modules for common functionality
5. Document template parameters and requirements

### Management tools

1. **Web UI** - Edit templates directly in the Coder dashboard
2. **CLI** - Use `coder templates` commands for programmatic management
3. **API** - Integrate template management into existing tools

## Template ecosystem

### Provider support

Templates can use any Terraform provider:

1. **Cloud providers** - AWS, Azure, GCP, DigitalOcean
2. **Container platforms** - Docker, Kubernetes, OpenShift
3. **Virtualization** - VMware, Proxmox, Hyper-V
4. **Specialized providers** - Coder, Envbuilder, custom providers

### Integration points

1. **Identity providers** - OIDC, SAML, GitHub, GitLab
2. **Secret management** - HashiCorp Vault, cloud secret managers
3. **Container registries** - Docker Hub, ECR, ACR, GCR
4. **Source control** - GitHub, GitLab, Bitbucket, Azure DevOps

## Getting started

Choose your approach based on your needs and experience level:

1. **Start with a starter template** - Use pre-built templates for common platforms
2. **Customize existing templates** - Modify starter templates for your needs
3. **Build from scratch** - Create templates for specialized infrastructure

Templates are the foundation of effective developer environment management with Coder. They enable organizations to provide consistent, secure, and productive development environments while maintaining the flexibility to adapt to different team needs and infrastructure requirements.

### Next steps

- [Creating Templates](../admin/templates/creating-templates.md) - Learn how to create your first template
- [Template Tutorial](../tutorials/template-from-scratch.md) - Step-by-step guide to building a template
- [Extending Templates](../admin/templates/extending-templates/index.md) - Add advanced features and customization
- [Managing Templates](../admin/templates/managing-templates/index.md) - Best practices for template lifecycle management
- [Coder Registry](https://registry.coder.com) - Browse available templates and modules
